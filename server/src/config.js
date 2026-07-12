require("dotenv").config();

function required(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

function optional(name, fallback = "") {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : fallback;
}

function getAppEnv() {
  const appEnv = optional("APP_ENV", "dev").toLowerCase();
  const allowed = new Set(["dev", "test", "prod"]);

  if (!allowed.has(appEnv)) {
    throw new Error(`Invalid APP_ENV="${appEnv}". Allowed values: dev, test, prod`);
  }

  return appEnv;
}

function envPrefix(appEnv) {
  return appEnv.toUpperCase();
}

function getConfig() {
  const appEnv = getAppEnv();
  const prefix = envPrefix(appEnv);

  return {
    service: {
      name: "refex-p2p-dynamic-pdf",
      version: "0.1.0",
      port: Number(optional("PORT", "8080")),
      nodeEnv: optional("NODE_ENV", "development"),
      appEnv
    },
    gcp: {
      projectId: required("GCP_PROJECT_ID"),
      region: required("GCP_REGION"),
      bucketName: required(`${prefix}_GCS_BUCKET_NAME`)
    },
    kissflow: {
      baseUrl: required(`${prefix}_KISSFLOW_BASE_URL`),
      accountId: required(`${prefix}_KISSFLOW_ACCOUNT_ID`),
      accessKeyId: required(`${prefix}_KISSFLOW_ACCESS_KEY_ID`),
      accessKeySecret: required(`${prefix}_KISSFLOW_ACCESS_KEY_SECRET`),
      devSathishAccessKeyId: optional("DEV_SATHISH_KISSFLOW_ACCESS_KEY_ID", ""),
      devSathishAccessKeySecret: optional("DEV_SATHISH_KISSFLOW_ACCESS_KEY_SECRET", "")
    },
    pdf: {
      signedUrlTtlMinutes: Number(optional("PDF_SIGNED_URL_TTL_MINUTES", "240"))
    },
    kissflowModels: {
      companyLetterheadDataformId: required("COMPANY_LETTERHEAD_DATAFORM_ID"),
      poAnnexureMasterDataformId: required("PO_ANNEXURE_MASTER_DATAFORM_ID"),
      purchaseOrderProcessId: required("PURCHASE_ORDER_PROCESS_ID"),
      purchaseOrderLineItemsTableId: required("PURCHASE_ORDER_LINE_ITEMS_TABLE_ID")
    }
  };
}

module.exports = {
  getConfig
};
