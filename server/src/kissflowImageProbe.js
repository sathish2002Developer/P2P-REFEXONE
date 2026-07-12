require("dotenv/config");
const fs = require("fs/promises");
const { getConfig } = require("./config");

function headers(config) {
  return {
    "X-Access-Key-Id": config.kissflow.accessKeyId,
    "X-Access-Key-Secret": config.kissflow.accessKeySecret
  };
}

function candidateUrls({ baseUrl, accountId, key }) {
  const encodedKey = encodeURIComponent(key);

  return [
    `${baseUrl}/attachment/2/${accountId}/${encodedKey}`,
    `${baseUrl}/file/2/${accountId}/${encodedKey}`,
    `${baseUrl}/form/2/${accountId}/download/${encodedKey}`,
    `${baseUrl}/process/2/${accountId}/download/${encodedKey}`,
    `${baseUrl}/download/${encodedKey}`,
    `${baseUrl}/${key}`
  ];
}

async function probeUrl(url, config) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: headers(config)
    });

    const contentType = response.headers.get("content-type") || "";
    const contentLength = response.headers.get("content-length") || "";

    return {
      url,
      status: response.status,
      ok: response.ok,
      content_type: contentType,
      content_length: contentLength
    };
  } catch (error) {
    return {
      url,
      ok: false,
      error: error.message
    };
  }
}

async function main() {
  const config = getConfig();
  const saved = JSON.parse(await fs.readFile("server/tmp/ril-letterhead.json", "utf8"));
  const row = saved.row;

  for (const field of ["Logo_File", "Logo_File_Right"]) {
    const image = row[field];
    const key = image?.key;

    console.log(`\n=== ${field} ===`);
    console.log("name:", image?.name || "");
    console.log("key:", key || "");

    if (!key) {
      console.log("No key found");
      continue;
    }

    for (const url of candidateUrls({
      baseUrl: config.kissflow.baseUrl.replace(/\/+$/, ""),
      accountId: config.kissflow.accountId,
      key
    })) {
      const result = await probeUrl(url, config);
      console.log(JSON.stringify(result));
    }
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exit(1);
});
