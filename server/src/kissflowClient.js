const { getConfig } = require("./config");

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildKissflowUrl(path) {
  const config = getConfig();
  const baseUrl = config.kissflow.baseUrl.replace(/\/+$/, "");
  const cleanPath = String(path || "").startsWith("/") ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}

function buildKissflowAuthHeaders(extraHeaders = {}) {
  const config = getConfig();

  return {
    Accept: "application/json, image/*, */*",
    "User-Agent": "Refex-P2P-PDF-Service/1.0",
    "X-Access-Key-Id": config.kissflow.accessKeyId,
    "X-Access-Key-Secret": config.kissflow.accessKeySecret,
    ...extraHeaders
  };
}

function isCloudflareChallenge(body = "") {
  const text = String(body || "");

  return (
    text.includes("Just a moment") ||
    text.includes("cf-chl") ||
    text.includes("challenge-platform") ||
    text.includes("Enable JavaScript and cookies to continue")
  );
}

function parseRetryAfterMs(response) {
  const retryAfter = response.headers.get("retry-after");

  if (!retryAfter) {
    return null;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }

  const retryDate = Date.parse(retryAfter);

  if (Number.isFinite(retryDate)) {
    return Math.max(retryDate - Date.now(), 0);
  }

  return null;
}

function formatKissflowError(method, url, status, statusText, body = "") {
  if (status === 429 && isCloudflareChallenge(body)) {
    return (
      `Kissflow temporarily blocked requests due to rate limiting (Cloudflare 429). ` +
      `Wait 1-2 minutes and retry. Request: ${method} ${url}`
    );
  }

  if (status === 429) {
    return (
      `Kissflow rate limit reached (429 Too Many Requests). ` +
      `Wait a minute and retry. Request: ${method} ${url}`
    );
  }

  const preview = String(body || "").slice(0, 300);

  return `Kissflow API failed: ${method} ${url} -> ${status} ${statusText}: ${preview}`;
}

function shouldRetryStatus(status) {
  return status === 429 || status === 503 || status === 502 || status === 504;
}

async function kissflowFetch(url, options = {}, retryOptions = {}) {
  const method = options.method || "GET";
  const responseType = options.responseType || "text";
  const maxRetries = Number.isFinite(retryOptions.maxRetries)
    ? retryOptions.maxRetries
    : DEFAULT_MAX_RETRIES;
  const baseDelayMs = Number.isFinite(retryOptions.baseDelayMs)
    ? retryOptions.baseDelayMs
    : DEFAULT_BASE_DELAY_MS;

  let lastResponse = null;
  let lastBody = responseType === "buffer" ? Buffer.alloc(0) : "";

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: buildKissflowAuthHeaders(options.headers || {}),
      body: options.body
    });

    lastResponse = response;

    if (responseType === "buffer") {
      lastBody = Buffer.from(await response.arrayBuffer());
    } else {
      lastBody = await response.text();
    }

    if (response.ok || !shouldRetryStatus(response.status) || attempt >= maxRetries) {
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        body: lastBody,
        response
      };
    }

    const retryAfterMs = parseRetryAfterMs(response) ?? baseDelayMs * (2 ** attempt);
    await sleep(retryAfterMs);
  }

  return {
    ok: false,
    status: lastResponse?.status || 0,
    statusText: lastResponse?.statusText || "",
    headers: lastResponse?.headers,
    body: lastBody,
    response: lastResponse
  };
}

async function kfRequest(path, options = {}, retryOptions = {}) {
  const url = buildKissflowUrl(path);
  const method = options.method || "GET";

  const result = await kissflowFetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  }, retryOptions);

  let data;
  try {
    data = result.body ? JSON.parse(result.body) : null;
  } catch (_error) {
    data = result.body;
  }

  if (!result.ok) {
    throw new Error(formatKissflowError(method, url, result.status, result.statusText, result.body));
  }

  return {
    ok: true,
    status: result.status,
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
  buildKissflowAuthHeaders,
  kissflowFetch,
  kfRequest,
  getAccountProbe,
  isCloudflareChallenge,
  formatKissflowError,
  sleep
};
