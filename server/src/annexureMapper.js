function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isIncluded(value) {
  return value !== false;
}

function mapTermsRows(masterRecord = {}) {
  const rows = masterRecord["Table::Terms_and_Conditions"] || [];

  return rows
    .filter((row) => isIncluded(row.Is_Default_1) && isIncluded(row.Is_Active_1))
    .map((row) => ({
      sequence_no: toNumber(row.Sequence_No),
      term_header: row.Term_Header || "",
      term_description: row.Term_Description || "",
      source_row_id: row._id || null,
      remarks: row.Remarks || ""
    }))
    .sort((a, b) => a.sequence_no - b.sequence_no);
}

function mapAnnexureIRows(masterRecord = {}) {
  const rows = masterRecord["Table::Annexure_I_Commercial_Terms"] || [];

  return rows
    .filter((row) => isIncluded(row.Is_Default_2) && isIncluded(row.Is_Active_2))
    .map((row) => ({
      sequence_no: toNumber(row.Sequence_No_1),
      header: row.Untitled_Field || "",
      terms_and_conditions: row.Terms_And_Conditions_1 || "",
      clause_code: row.Clause_Code || "",
      page_break_after: Boolean(row.Page_Break_After),
      source_row_id: row._id || null,
      remarks: row.Remarks_1 || ""
    }))
    .sort((a, b) => a.sequence_no - b.sequence_no);
}

function mapAnnexureMaster(masterRecord = {}) {
  return {
    id: masterRecord._id || null,
    annexure_code: masterRecord.Annexure_Code || "",
    annexure_name: masterRecord.Annexure_Name || "",
    company_code: masterRecord.Company_Code || "",
    po_type: masterRecord.PO_Type || "",
    category: masterRecord.Category || "",
    version: masterRecord.Version || "",
    is_active: Boolean(masterRecord.Is_Active),
    is_default: Boolean(masterRecord.Is_Default),
    terms: mapTermsRows(masterRecord),
    annexure_i: mapAnnexureIRows(masterRecord)
  };
}

module.exports = {
  mapAnnexureMaster,
  mapTermsRows,
  mapAnnexureIRows
};
