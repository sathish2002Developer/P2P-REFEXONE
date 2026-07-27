const { getConfig } = require("./config");
const { buildKissflowUrl } = require("./kissflowClient");

function resolveActivityInstanceId(po = {}) {
  // Canonical source from Admin item details API for active process items.
  const currentContext = Array.isArray(po._current_context) ? po._current_context : [];

  for (const context of currentContext) {
    const contextActivityInstanceId = context?._context_activity_instance_id;

    if (typeof contextActivityInstanceId === "string" && contextActivityInstanceId.trim()) {
      return contextActivityInstanceId.trim();
    }
  }

  throw new Error(
    "Cannot attach PDF because _current_context[]._context_activity_instance_id is missing from the Admin item details API response. Ensure the PO is InProgress and fetched from /process/2/:account_id/admin/:process_id/:instance_id."
  );
}

function normalizePdfApiUser(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveAttachmentCredentials(config, po = {}) {
  const requestedUser = normalizePdfApiUser(po.PDF_API_User);

  if (config.service.appEnv === "dev") {
    if (requestedUser === "bobby") {
      return {
        selectedUser: "Bobby",
        accessKeyId: config.kissflow.accessKeyId,
        accessKeySecret: config.kissflow.accessKeySecret
      };
    }

    if (requestedUser === "sathish") {
      if (!config.kissflow.devSathishAccessKeyId || !config.kissflow.devSathishAccessKeySecret) {
        throw new Error("PDF_API_User is Sathish, but DEV Sathish Kissflow keys are not configured.");
      }

      return {
        selectedUser: "Sathish",
        accessKeyId: config.kissflow.devSathishAccessKeyId,
        accessKeySecret: config.kissflow.devSathishAccessKeySecret
      };
    }

    throw new Error("Choose PDF_API_User as Bobby or Sathish before generating the PDF.");
  }

  return {
    selectedUser: "default",
    accessKeyId: config.kissflow.accessKeyId,
    accessKeySecret: config.kissflow.accessKeySecret
  };
}

async function attachPdfToProcessField({
  processId,
  instanceId,
  activityInstanceId,
  fieldId,
  filename,
  buffer,
  po = {}
}) {
  const config = getConfig();

  if (!processId) throw new Error("attachPdfToProcessField requires processId");
  if (!instanceId) throw new Error("attachPdfToProcessField requires instanceId");
  if (!activityInstanceId) throw new Error("attachPdfToProcessField requires activityInstanceId");
  if (!fieldId) throw new Error("attachPdfToProcessField requires fieldId");
  if (!filename) throw new Error("attachPdfToProcessField requires filename");
  if (!buffer || !Buffer.isBuffer(buffer)) throw new Error("attachPdfToProcessField requires PDF buffer");

  const path =
    `/process/2/${config.kissflow.accountId}` +
    `/${processId}` +
    `/${instanceId}` +
    `/${activityInstanceId}` +
    `/${fieldId}` +
    `/attachment`;

  const formData = new FormData();
  const blob = new Blob([buffer], { type: "application/pdf" });
  formData.append("file", blob, filename);

  const credentials = resolveAttachmentCredentials(config, po);

  const response = await fetch(buildKissflowUrl(path), {
    method: "POST",
    headers: {
      "X-Access-Key-Id": credentials.accessKeyId,
      "X-Access-Key-Secret": credentials.accessKeySecret
    },
    body: formData
  });

  const responseText = await response.text();

  let data;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (_error) {
    data = responseText;
  }

  if (!response.ok) {
    throw new Error(
      `Kissflow attachment API failed: POST ${path} -> ${response.status} ${response.statusText}: ${responseText}`
    );
  }

  return {
    ok: true,
    status: response.status,
    path,
    field_id: fieldId,
    filename,
    attachment_api_user: credentials.selectedUser,
    data
  };
}

module.exports = {
  resolveActivityInstanceId,
  resolveAttachmentCredentials,
  attachPdfToProcessField
};
