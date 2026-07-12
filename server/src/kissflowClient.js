const { getConfig } = require("./config");

function buildKissflowUrl(path) {
  const config = getConfig();
  const baseUrl = config.kissflow.baseUrl.replace(/\/+$/, "");
  const cleanPath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

async function kfRequest(path, options = {}) {
  const config = getConfig();

  const url = buildKissflowUrl(path);
  const method = options.method || "GET";

  const headers = {
    "Content-Type": "application/json",
    "X-Access-Key-Id": config.kissflow.accessKeyId,
    "X-Access-Key-Secret": config.kissflow.accessKeySecret,
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const responseText = await response.text();

  let data;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch (_error) {
    data = responseText;
  }

  if (!response.ok) {
    throw new Error(`Kissflow API failed: ${method} ${url} -> ${response.status} ${response.statusText}: ${responseText}`);
  }

  return {
    ok: true,
    status: response.status,
    data
  };
}

async function getAccountProbe() {
  const config = getConfig();

  return {
    base_url: config.kissflow.baseUrl,
    account_id: config.kissflow.accountId,
    access_key_id_set: Boolean(config.kissflow.accessKeyId),
    access_key_secret_set: Boolean(config.kissflow.accessKeySecret)
  };
}

module.exports = {
  buildKissflowUrl,
  kfRequest,
  getAccountProbe
};
