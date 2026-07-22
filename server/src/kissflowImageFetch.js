const { getConfig } = require("./config");
const { buildKissflowUrl } = require("./kissflowClient");

function fixAttachmentKey(key = "", dataformId = "") {
  return String(key || "").replace(/^undefined\//, `${dataformId}/`);
}

function allKeysForImage(image = {}, dataformId = "") {
  const keys = new Set();

  if (image?.key) {
    keys.add(fixAttachmentKey(image.key, dataformId));
  }

  for (const photo of image?.photos || []) {
    if (photo?.key) {
      keys.add(fixAttachmentKey(photo.key, dataformId));
    }
  }

  return Array.from(keys).filter(Boolean);
}

function buildAttachmentCandidateUrls({
  baseUrl = "",
  accountId = "",
  dataformId = "",
  instanceId = "",
  attachmentId = "",
  filename = "",
  key = ""
}) {
  const cleanBase = String(baseUrl || "").replace(/\/+$/, "");
  const encodedKey = encodeURIComponent(key);
  const encodedFilename = encodeURIComponent(filename || "");

  const urls = [];

  if (key) {
    urls.push(
      `${cleanBase}/attachment/2/${accountId}/${encodedKey}`,
      `${cleanBase}/file/2/${accountId}/${encodedKey}`,
      `${cleanBase}/form/2/${accountId}/download/${encodedKey}`,
      `${cleanBase}/process/2/${accountId}/download/${encodedKey}`,
      `${cleanBase}/download/${encodedKey}`,
      `${cleanBase}/${key}`
    );
  }

  if (attachmentId && dataformId && instanceId) {
    urls.push(
      `${cleanBase}/form/2/${accountId}/${dataformId}/${instanceId}/attachment/${attachmentId}/${encodedFilename}`,
      `${cleanBase}/form/2/${accountId}/${dataformId}/${instanceId}/file/${attachmentId}/${encodedFilename}`,
      `${cleanBase}/form/2/${accountId}/${dataformId}/${instanceId}/download/${attachmentId}/${encodedFilename}`,
      `${cleanBase}/form/2/${accountId}/${dataformId}/${instanceId}/${attachmentId}/${encodedFilename}`,
      `${cleanBase}/attachment/2/${accountId}/${attachmentId}`,
      `${cleanBase}/attachment/2/${accountId}/${attachmentId}/${encodedFilename}`,
      `${cleanBase}/file/2/${accountId}/${attachmentId}`,
      `${cleanBase}/file/2/${accountId}/${attachmentId}/${encodedFilename}`
    );
  }

  return [...new Set(urls.filter(Boolean))];
}

function buildKissflowAuthHeaders() {
  const config = getConfig();

  return {
    "X-Access-Key-Id": config.kissflow.accessKeyId,
    "X-Access-Key-Secret": config.kissflow.accessKeySecret
  };
}

function isImageContentType(contentType = "") {
  return String(contentType || "").toLowerCase().startsWith("image/");
}

async function fetchUrlAsDataUri(url, headers = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";

  if (!isImageContentType(contentType)) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  return `data:${contentType};base64,${base64}`;
}

async function fetchKissflowAttachmentAsDataUri(image = {}, context = {}) {
  if (!image || (typeof image !== "object")) {
    return "";
  }

  const config = getConfig();
  const baseUrl = String(context.baseUrl || config.kissflow.baseUrl || "").replace(/\/+$/, "");
  const accountId = context.accountId || config.kissflow.accountId;
  const dataformId = context.dataformId || "";
  const instanceId = context.instanceId || context.rowId || "";
  const headers = buildKissflowAuthHeaders();
  const keys = allKeysForImage(image, dataformId);

  for (const key of keys) {
    for (const url of buildAttachmentCandidateUrls({
      baseUrl,
      accountId,
      dataformId,
      instanceId,
      attachmentId: image.id,
      filename: image.name,
      key
    })) {
      const dataUri = await fetchUrlAsDataUri(url, headers);

      if (dataUri) {
        return dataUri;
      }
    }
  }

  if (image.id && dataformId && instanceId) {
    for (const url of buildAttachmentCandidateUrls({
      baseUrl,
      accountId,
      dataformId,
      instanceId,
      attachmentId: image.id,
      filename: image.name
    })) {
      const dataUri = await fetchUrlAsDataUri(url, headers);

      if (dataUri) {
        return dataUri;
      }
    }
  }

  return "";
}

async function resolveLetterheadLogoSources(row = {}, context = {}) {
  const leftUrl = String(row.Header_Left_Logo_URL || "").trim();
  const rightUrl = String(row.Header_Right_Logo_URL || "").trim();

  const sources = {
    left: leftUrl,
    right: rightUrl,
    left_source: leftUrl ? "url_field" : "none",
    right_source: rightUrl ? "url_field" : "none"
  };

  const fetchContext = {
    ...context,
    instanceId: context.instanceId || row._id || "",
    rowId: row._id || ""
  };

  if (!sources.left && row.Logo_File) {
    const dataUri = await fetchKissflowAttachmentAsDataUri(row.Logo_File, fetchContext);

    if (dataUri) {
      sources.left = dataUri;
      sources.left_source = "attachment";
    }
  }

  if (!sources.right && row.Logo_File_Right) {
    const dataUri = await fetchKissflowAttachmentAsDataUri(row.Logo_File_Right, fetchContext);

    if (dataUri) {
      sources.right = dataUri;
      sources.right_source = "attachment";
    }
  }

  return sources;
}

function isKissflowHostUrl(url = "") {
  const config = getConfig();
  const baseUrl = String(config.kissflow.baseUrl || "").replace(/\/+$/, "");

  return Boolean(baseUrl && String(url || "").startsWith(baseUrl));
}

module.exports = {
  fixAttachmentKey,
  allKeysForImage,
  buildAttachmentCandidateUrls,
  buildKissflowAuthHeaders,
  fetchKissflowAttachmentAsDataUri,
  resolveLetterheadLogoSources,
  isKissflowHostUrl,
  buildKissflowUrl
};
