const { getConfig } = require("./config");
const { kfRequest } = require("./kissflowClient");

function dataformItemsPath(dataformId, query = {}) {
  const config = getConfig();
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      params.set(key, String(value));
    }
  }

  const suffix = params.toString() ? `?${params.toString()}` : "";

  return `/form/2/${config.kissflow.accountId}/${dataformId}/list${suffix}`;
}

async function listDataformItems(dataformId, { pageNumber = 1, pageSize = 5 } = {}) {
  return kfRequest(dataformItemsPath(dataformId, {
    page_number: pageNumber,
    page_size: pageSize
  }), {
    method: "GET"
  });
}

async function probeMasterDataforms() {
  const config = getConfig();

  const [letterheads, annexures] = await Promise.all([
    listDataformItems(config.kissflowModels.companyLetterheadDataformId, { pageSize: 3 }),
    listDataformItems(config.kissflowModels.poAnnexureMasterDataformId, { pageSize: 3 })
  ]);

  return {
    letterheads,
    annexures
  };
}


function dataformItemDetailPath(dataformId, itemId) {
  const config = getConfig();
  return `/form/2/${config.kissflow.accountId}/${dataformId}/${itemId}`;
}

async function getDataformItem(dataformId, itemId) {
  return kfRequest(dataformItemDetailPath(dataformId, itemId), {
    method: "GET"
  });
}


async function findCompanyLetterheadByCode(companyCode) {
  return findCompanyLetterhead({ companyCode });
}

async function findCompanyLetterhead({ companyCode = "", companyName = "" } = {}) {
  const config = getConfig();
  const normalizedCode = normalizeLookupText(companyCode);
  const normalizedName = normalizeLookupText(companyName);

  if (!normalizedCode && !normalizedName) {
    return {
      status: 200,
      companyCode: "",
      companyName: "",
      found: false,
      row: null,
      matched_by: "none",
      totalCount: 0
    };
  }

  const result = await listDataformItems(
    config.kissflowModels.companyLetterheadDataformId,
    { pageNumber: 1, pageSize: 100 }
  );

  const rows = result.data?.Data || [];

  if (normalizedCode) {
    const codeMatch = rows.find((row) => {
      return normalizeLookupText(row.Company_Code) === normalizedCode;
    });

    if (codeMatch) {
      return {
        status: result.status,
        companyCode: normalizedCode,
        companyName: normalizedName,
        found: true,
        row: codeMatch,
        matched_by: "company_code",
        totalCount: result.data?.count ?? rows.length
      };
    }
  }

  if (normalizedName) {
    const nameMatch = rows.find((row) => {
      const candidates = [row.Company_Name, row.Untitled_Field, row.Company_Code]
        .map(normalizeLookupText)
        .filter(Boolean);

      return candidates.includes(normalizedName);
    });

    if (nameMatch) {
      return {
        status: result.status,
        companyCode: normalizeLookupText(nameMatch.Company_Code) || normalizedCode,
        companyName: normalizedName,
        found: true,
        row: nameMatch,
        matched_by: "company_name",
        totalCount: result.data?.count ?? rows.length
      };
    }
  }

  return {
    status: result.status,
    companyCode: normalizedCode,
    companyName: normalizedName,
    found: false,
    row: null,
    matched_by: "none",
    totalCount: result.data?.count ?? rows.length
  };
}

function normalizeLookupText(value) {
  return String(value || "").trim().toUpperCase();
}

function isTruthyFlag(value) {
  if (value === true) return true;
  const normalized = normalizeLookupText(value);
  return ["TRUE", "YES", "Y", "1", "ACTIVE"].includes(normalized);
}

function readPoType(row = {}) {
  return (
    row.PO_Type ||
    row.Po_Type ||
    row.po_type ||
    row.Template_Type ||
    row.TemplateType ||
    ""
  );
}

function readVersionNumber(row = {}) {
  const raw = row.Version ?? row.version ?? row.Template_Version ?? 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findAnnexureMasterByPoType(poType) {
  const config = getConfig();
  const normalizedPoType = normalizeLookupText(poType);

  if (!normalizedPoType) {
    throw new Error("po_type is required to find PO annexure master");
  }

  const result = await listDataformItems(
    config.kissflowModels.poAnnexureMasterDataformId,
    { pageNumber: 1, pageSize: 200 }
  );

  const rows = result.data?.Data || [];

  const matchingRows = rows.filter((row) => {
    return normalizeLookupText(readPoType(row)) === normalizedPoType;
  });

  if (matchingRows.length === 0) {
    throw new Error(`No PO annexure master found for PO_Type: ${poType}`);
  }

  const activeRows = matchingRows.filter((row) => {
    if (row.Is_Active === undefined && row.is_active === undefined) return true;
    return isTruthyFlag(row.Is_Active ?? row.is_active);
  });

  const candidates = activeRows.length > 0 ? activeRows : matchingRows;

  const sorted = [...candidates].sort((a, b) => {
    const aDefault = isTruthyFlag(a.Is_Default ?? a.Default ?? a.IsDefault);
    const bDefault = isTruthyFlag(b.Is_Default ?? b.Default ?? b.IsDefault);

    if (aDefault !== bDefault) return aDefault ? -1 : 1;

    return readVersionNumber(b) - readVersionNumber(a);
  });

  const match = sorted[0];

  return {
    status: result.status,
    poType,
    found: Boolean(match),
    row: match || null,
    totalCount: result.data?.count ?? rows.length,
    matchedCount: matchingRows.length,
    activeMatchedCount: activeRows.length
  };
}

module.exports = {
  dataformItemsPath,
  dataformItemDetailPath,
  listDataformItems,
  getDataformItem,
  findCompanyLetterheadByCode,
  findCompanyLetterhead,
  findAnnexureMasterByPoType,
  probeMasterDataforms
};
