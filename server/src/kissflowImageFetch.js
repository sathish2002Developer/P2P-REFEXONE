const { getConfig } = require("./config");
const { buildKissflowUrl, buildKissflowAuthHeaders, kissflowFetch, isCloudflareChallenge } = require("./kissflowClient");

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

function parseProcessAttachmentKey(key = "") {
  const parts = String(key || "").split("/").filter(Boolean);

  if (parts.length < 4) {
    return null;
  }

  const [processId, instanceId, activityInstanceId, attachmentId, ...filenameParts] = parts;

  if (!processId || !instanceId || !attachmentId) {
    return null;
  }

  return {
    processId,
    instanceId,
    activityInstanceId: activityInstanceId || "",
    attachmentId,
    filename: filenameParts.join("/") || ""
  };
}

function buildFilenameVariants(...names) {
  const variants = new Set();

  for (const name of names) {
    const value = String(name || "").trim();

    if (!value) {
      continue;
    }

    variants.add(value);
    variants.add(value.replace(/ /g, "_"));
    variants.add(value.replace(/_/g, " "));
  }

  return [...variants].filter(Boolean);
}

function buildProcessFieldAttachmentUrls({
  cleanBase,
  accountId,
  processId,
  instanceId,
  activityInstanceId,
  fieldId,
  attachmentId,
  filename = "",
  imageName = ""
}) {
  if (!cleanBase || !accountId || !processId || !instanceId || !activityInstanceId || !fieldId || !attachmentId) {
    return [];
  }

  const urls = [];
  const filenames = buildFilenameVariants(filename, imageName);
  const processPaths = [
    `${cleanBase}/process/2/${accountId}/${processId}/${instanceId}/${activityInstanceId}/${fieldId}/attachment/${attachmentId}`,
    `${cleanBase}/process/2/${accountId}/admin/${processId}/${instanceId}/${activityInstanceId}/${fieldId}/attachment/${attachmentId}`
  ];

  for (const path of processPaths) {
    urls.push(path);

    for (const file of filenames) {
      urls.push(`${path}/${encodeURIComponent(file)}`);
    }
  }

  return urls;
}

function buildAttachmentDownloadUrls({
  baseUrl = "",
  accountId = "",
  dataformId = "",
  processId = "",
  instanceId = "",
  activityInstanceId = "",
  fieldId = "",
  attachmentId = "",
  filename = "",
  key = ""
}) {
  const cleanBase = String(baseUrl || "").replace(/\/+$/, "");
  const parsedKey = parseProcessAttachmentKey(key);
  const effectiveProcessId = parsedKey?.processId || processId;
  const effectiveInstanceId = parsedKey?.instanceId || instanceId;
  const effectiveActivityInstanceId = activityInstanceId || parsedKey?.activityInstanceId || "";
  const effectiveAttachmentId = parsedKey?.attachmentId || attachmentId;
  const effectiveFilename = parsedKey?.filename || filename;
  const urls = [];

  urls.push(
    ...buildProcessFieldAttachmentUrls({
      cleanBase,
      accountId,
      processId: effectiveProcessId,
      instanceId: effectiveInstanceId,
      activityInstanceId: effectiveActivityInstanceId,
      fieldId,
      attachmentId: effectiveAttachmentId,
      filename: effectiveFilename,
      imageName: filename
    })
  );

  if (effectiveAttachmentId) {
    urls.push(`${cleanBase}/attachment/2/${accountId}/${effectiveAttachmentId}`);
  }

  if (key) {
    urls.push(`${cleanBase}/attachment/2/${accountId}/${key}`);
  }

  if (effectiveAttachmentId && effectiveProcessId && effectiveInstanceId) {
    if (effectiveFilename) {
      urls.push(
        `${cleanBase}/process/2/${accountId}/${effectiveProcessId}/${effectiveInstanceId}/attachment/${effectiveAttachmentId}/${encodeURIComponent(effectiveFilename)}`,
        `${cleanBase}/process/2/${accountId}/admin/${effectiveProcessId}/${effectiveInstanceId}/attachment/${effectiveAttachmentId}/${encodeURIComponent(effectiveFilename)}`
      );
    }

    urls.push(
      `${cleanBase}/process/2/${accountId}/${effectiveProcessId}/${effectiveInstanceId}/attachment/${effectiveAttachmentId}`,
      `${cleanBase}/process/2/${accountId}/admin/${effectiveProcessId}/${effectiveInstanceId}/attachment/${effectiveAttachmentId}`
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
    context.fieldId || "",
    context.activityInstanceId || "",
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

function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return "";
  }

  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return "image/png";
  }

  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return "image/jpeg";
  }

  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return "image/gif";
  }

  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "image/webp";
  }

  return "";
}

function resolveImageContentType(contentType = "", buffer) {
  const normalized = String(contentType || "").toLowerCase().split(";")[0].trim();

  if (normalized.startsWith("image/")) {
    return normalized;
  }

  if (normalized === "application/octet-stream" || !normalized) {
    return detectImageMimeType(buffer);
  }

  return "";
}

function bufferToDataUri(buffer, contentType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return "";
  }

  const resolvedType = resolveImageContentType(contentType, buffer);

  if (!resolvedType) {
    return "";
  }

  return `data:${resolvedType};base64,${buffer.toString("base64")}`;
}

function buildProcessImageFieldPaths({
  processId = "",
  instanceId = "",
  fieldId = "",
  activityInstanceId = "",
  tableId = "",
  rowId = ""
}) {
  const paths = [];
  const cleanFieldId = String(fieldId || "").trim();
  const cleanProcessId = String(processId || "").trim();
  const cleanInstanceId = String(instanceId || "").trim();
  const cleanActivityId = String(activityInstanceId || "").trim();
  const cleanTableId = String(tableId || "").trim();
  const cleanRowId = String(rowId || "").trim();

  if (!cleanFieldId || !cleanProcessId || !cleanInstanceId) {
    return paths;
  }

  if (cleanActivityId && cleanTableId && cleanRowId) {
    const tableIds = [...new Set([cleanTableId, cleanTableId.startsWith("Table::") ? cleanTableId : `Table::${cleanTableId}`])];

    for (const tableSegment of tableIds) {
      paths.push(
        `/process/2/{accountId}/admin/${cleanProcessId}/${cleanInstanceId}/${cleanActivityId}/${tableSegment}/${cleanRowId}/${cleanFieldId}/image`,
        `/process/2/{accountId}/${cleanProcessId}/${cleanInstanceId}/${cleanActivityId}/${tableSegment}/${cleanRowId}/${cleanFieldId}/image`
      );
    }
  }

  const poLevelPaths = [
    `/process/2/{accountId}/admin/${cleanProcessId}/${cleanInstanceId}/${cleanFieldId}/image`,
    `/process/2/{accountId}/${cleanProcessId}/${cleanInstanceId}/${cleanFieldId}/image`
  ];
  const activityPaths = cleanActivityId
    ? [
      `/process/2/{accountId}/admin/${cleanProcessId}/${cleanInstanceId}/${cleanActivityId}/${cleanFieldId}/image`,
      `/process/2/{accountId}/${cleanProcessId}/${cleanInstanceId}/${cleanActivityId}/${cleanFieldId}/image`
    ]
    : [];

  if (!cleanTableId && !cleanRowId) {
    paths.push(...poLevelPaths, ...activityPaths);
  } else {
    paths.push(...activityPaths, ...poLevelPaths);
  }

  return [...new Set(paths)];
}

async function downloadProcessImageFieldBuffer({
  instanceId,
  fieldId,
  processId = "",
  activityInstanceId = "",
  tableId = "",
  rowId = "",
  credentials = {}
} = {}) {
  const config = getConfig();
  const effectiveProcessId = processId || config.kissflowModels.purchaseOrderProcessId;
  const accountId = config.kissflow.accountId;
  const pathTemplates = buildProcessImageFieldPaths({
    processId: effectiveProcessId,
    instanceId,
    fieldId,
    activityInstanceId,
    tableId,
    rowId
  });

  let lastError = null;

  for (const template of pathTemplates) {
    const path = template.replace("{accountId}", accountId);
    const result = await kissflowFetch(buildKissflowUrl(path), {
      method: "GET",
      responseType: "buffer",
      credentials,
      headers: {
        Accept: "application/octet-stream, image/*, */*"
      }
    }, {
      maxRetries: 1
    });

    if (result.status === 429) {
      markRateLimited();
      return { buffer: null, contentType: "", path, ok: false };
    }

    const buffer = Buffer.isBuffer(result.body) ? result.body : Buffer.from(result.body || []);

    if (!result.ok) {
      const bodyPreview = buffer.toString("utf8", 0, 200);

      if (isCloudflareChallenge(bodyPreview)) {
        markRateLimited();
      }

      lastError = `${path} -> ${result.status} ${result.statusText}`;
      continue;
    }

    const contentType = resolveImageContentType(result.headers.get("content-type") || "", buffer);

    if (!contentType) {
      lastError = `${path} -> unexpected content-type`;
      continue;
    }

    return {
      ok: true,
      buffer,
      contentType,
      path
    };
  }

  return {
    ok: false,
    buffer: null,
    contentType: "",
    path: pathTemplates[0]?.replace("{accountId}", accountId) || "",
    error: lastError || "No process image field route succeeded"
  };
}

async function fetchProcessImageFieldAsDataUri(options = {}) {
  if (isRateLimited()) {
    return "";
  }

  const config = getConfig();
  const cacheKey = [
    "process-image-field",
    options.processId || config.kissflowModels.purchaseOrderProcessId,
    options.instanceId || "",
    options.fieldId || "",
    options.activityInstanceId || "",
    options.tableId || "",
    options.rowId || ""
  ].join(":");

  if (attachmentDataUriCache.has(cacheKey)) {
    return attachmentDataUriCache.get(cacheKey);
  }

  const result = await downloadProcessImageFieldBuffer(options);

  if (!result.ok || !result.buffer) {
    return "";
  }

  const dataUri = bufferToDataUri(result.buffer, result.contentType);

  if (dataUri) {
    attachmentDataUriCache.set(cacheKey, dataUri);
  }

  return dataUri;
}

async function fetchAnnexureRowImageAsDataUri(row = {}, context = {}) {
  const parsedKey = parseProcessAttachmentKey(row.image_attachment?.key || "");
  const fieldId = row.image_field || "Po_image";
  const activityInstanceId = context.activityInstanceId || parsedKey?.activityInstanceId || "";
  const tableId = row.table_id || (row.source === "purchase_order_process_annexure_1" ? "ANNEXURE_1" : "");
  const rowId = row.source_row_id || "";

  const processImageDataUri = await fetchProcessImageFieldAsDataUri({
    processId: context.processId,
    instanceId: context.instanceId,
    fieldId,
    activityInstanceId,
    tableId,
    rowId,
    credentials: context.credentials || {}
  });

  if (processImageDataUri) {
    return {
      dataUri: processImageDataUri,
      download_method: "process_image_field"
    };
  }

  const attachmentDataUri = await fetchKissflowAttachmentAsDataUri(row.image_attachment, {
    baseUrl: context.baseUrl,
    processId: context.processId,
    instanceId: context.instanceId,
    fieldId,
    activityInstanceId,
    credentials: context.credentials || {},
    rowId: row.source_row_id || ""
  });

  return {
    dataUri: attachmentDataUri,
    download_method: attachmentDataUri ? "attachment_url" : "none"
  };
}

async function fetchUrlAsDataUri(url, { maxRetries = 1, credentials = {} } = {}) {
  const result = await kissflowFetch(url, {
    method: "GET",
    responseType: "buffer",
    credentials,
    headers: {
      Accept: "application/octet-stream, image/*, */*"
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

  const buffer = Buffer.isBuffer(result.body) ? result.body : Buffer.from(result.body || []);
  const contentType = resolveImageContentType(result.headers.get("content-type") || "", buffer);

  if (!contentType || buffer.length === 0) {
    return "";
  }

  const base64 = buffer.toString("base64");

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
  const parsedKey = parseProcessAttachmentKey(key);
  const fieldId = context.fieldId || "";
  const activityInstanceId = context.activityInstanceId || parsedKey?.activityInstanceId || "";
  const credentials = context.credentials || {};
  const urls = buildAttachmentDownloadUrls({
    baseUrl,
    accountId,
    dataformId,
    processId: parsedKey?.processId || processId,
    instanceId: parsedKey?.instanceId || instanceId,
    activityInstanceId,
    fieldId,
    attachmentId: parsedKey?.attachmentId || image.id,
    filename: parsedKey?.filename || image.name,
    key
  });

  for (const url of urls) {
    const dataUri = await fetchUrlAsDataUri(url, {
      maxRetries: 1,
      credentials
    });

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

    const { dataUri, download_method: downloadMethod } = await fetchAnnexureRowImageAsDataUri(row, context);

    resolved.push({
      ...row,
      image_data_uri: dataUri,
      image_loaded: Boolean(dataUri),
      image_download_method: downloadMethod
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
  parseProcessAttachmentKey,
  buildAttachmentDownloadUrls,
  buildKissflowAuthHeaders,
  fetchKissflowAttachmentAsDataUri,
  downloadProcessImageFieldBuffer,
  fetchProcessImageFieldAsDataUri,
  fetchAnnexureRowImageAsDataUri,
  resolveAnnexure1ImageRows,
  resolveLetterheadLogoSources,
  isKissflowHostUrl,
  isRateLimited,
  clearAttachmentCache
};
