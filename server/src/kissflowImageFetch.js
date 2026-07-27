const { getConfig } = require("./config");
const { buildKissflowAuthHeaders, kissflowFetch, isCloudflareChallenge } = require("./kissflowClient");

const attachmentDataUriCache = new Map();
let rateLimitedUntil = 0;

function fixAttachmentKey(key = "", dataformId = "") {
  return String(key || "").replace(/^undefined\//, `${dataformId}/`);
}

function primaryAttachmentKey(image = {}, dataformId = "") {
  if (image?.key) {
    return fixAttachmentKey(image.key, dataformId);
  }

  for (const photo of image?.photos || []) {
    if (photo?.key) {
      return fixAttachmentKey(photo.key, dataformId);
    }
  }

  return "";
}

function buildAttachmentDownloadUrls({
  baseUrl = "",
  accountId = "",
  dataformId = "",
  processId = "",
  instanceId = "",
  attachmentId = "",
  filename = "",
  key = ""
}) {
  const cleanBase = String(baseUrl || "").replace(/\/+$/, "");
  const urls = [];

  if (key) {
    urls.push(`${cleanBase}/attachment/2/${accountId}/${encodeURIComponent(key)}`);
    urls.push(`${cleanBase}/attachment/2/${accountId}/${key}`);
  }

  if (attachmentId && processId && instanceId) {
    if (filename) {
      urls.push(
        `${cleanBase}/process/2/${accountId}/${processId}/${instanceId}/attachment/${attachmentId}/${encodeURIComponent(filename)}`,
        `${cleanBase}/process/2/${accountId}/admin/${processId}/${instanceId}/attachment/${attachmentId}/${encodeURIComponent(filename)}`
      );
    }

    urls.push(
      `${cleanBase}/process/2/${accountId}/${processId}/${instanceId}/attachment/${attachmentId}`,
      `${cleanBase}/process/2/${accountId}/admin/${processId}/${instanceId}/attachment/${attachmentId}`
    );
  }

  if (attachmentId && dataformId && instanceId) {
    if (filename) {
      urls.push(
        `${cleanBase}/form/2/${accountId}/${dataformId}/${instanceId}/attachment/${attachmentId}/${encodeURIComponent(filename)}`
      );
    } else {
      urls.push(
        `${cleanBase}/form/2/${accountId}/${dataformId}/${instanceId}/attachment/${attachmentId}`
      );
    }
  }

  return [...new Set(urls.filter(Boolean))];
}

function buildCacheKey(image = {}, context = {}) {
  return [
    context.dataformId || "",
    context.instanceId || "",
    image.id || "",
    image.key || "",
    image.name || ""
  ].join(":");
}

function markRateLimited(retryAfterMs = 90000) {
  rateLimitedUntil = Date.now() + retryAfterMs;
}

function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}

function isImageContentType(contentType = "") {
  return String(contentType || "").toLowerCase().startsWith("image/");
}

async function fetchUrlAsDataUri(url, { maxRetries = 1 } = {}) {
  const result = await kissflowFetch(url, {
    method: "GET",
    responseType: "buffer",
    headers: {
      Accept: "image/*, */*"
    }
  }, {
    maxRetries
  });

  if (result.status === 429) {
    markRateLimited();
    return "";
  }

  if (!result.ok) {
    const bodyPreview = Buffer.isBuffer(result.body) ? result.body.toString("utf8", 0, 200) : String(result.body || "");

    if (isCloudflareChallenge(bodyPreview)) {
      markRateLimited();
    }

    return "";
  }

  const contentType = result.headers.get("content-type") || "";

  if (!isImageContentType(contentType)) {
    return "";
  }

  const base64 = Buffer.from(result.body).toString("base64");

  return `data:${contentType};base64,${base64}`;
}

async function fetchKissflowAttachmentAsDataUri(image = {}, context = {}) {
  if (!image || typeof image !== "object") {
    return "";
  }

  if (isRateLimited()) {
    return "";
  }

  const cacheKey = buildCacheKey(image, context);

  if (attachmentDataUriCache.has(cacheKey)) {
    return attachmentDataUriCache.get(cacheKey);
  }

  const config = getConfig();
  const baseUrl = String(context.baseUrl || config.kissflow.baseUrl || "").replace(/\/+$/, "");
  const accountId = context.accountId || config.kissflow.accountId;
  const dataformId = context.dataformId || "";
  const processId = context.processId || "";
  const instanceId = context.instanceId || context.rowId || "";
  const key = primaryAttachmentKey(image, dataformId);
  const urls = buildAttachmentDownloadUrls({
    baseUrl,
    accountId,
    dataformId,
    processId,
    instanceId,
    attachmentId: image.id,
    filename: image.name,
    key
  });

  for (const url of urls) {
    const dataUri = await fetchUrlAsDataUri(url, { maxRetries: 1 });

    if (dataUri) {
      attachmentDataUriCache.set(cacheKey, dataUri);
      return dataUri;
    }
  }

  return "";
}

async function resolveAnnexure1ImageRows(rows = [], context = {}) {
  const resolved = [];

  for (const row of rows) {
    if (row.row_type !== "image") {
      resolved.push(row);
      continue;
    }

    const dataUri = await fetchKissflowAttachmentAsDataUri(row.image_attachment, {
      baseUrl: context.baseUrl,
      processId: context.processId,
      instanceId: context.instanceId,
      rowId: row.source_row_id || ""
    });

    resolved.push({
      ...row,
      image_data_uri: dataUri,
      image_loaded: Boolean(dataUri)
    });
  }

  return resolved;
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

  if (isRateLimited()) {
    return sources;
  }

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

function clearAttachmentCache() {
  attachmentDataUriCache.clear();
  rateLimitedUntil = 0;
}

module.exports = {
  fixAttachmentKey,
  primaryAttachmentKey,
  buildAttachmentDownloadUrls,
  buildKissflowAuthHeaders,
  fetchKissflowAttachmentAsDataUri,
  resolveAnnexure1ImageRows,
  resolveLetterheadLogoSources,
  isKissflowHostUrl,
  isRateLimited,
  clearAttachmentCache
};
