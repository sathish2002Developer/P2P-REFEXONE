require("dotenv/config");
const fs = require("fs/promises");
const { getConfig } = require("./config");

function headers(config) {
  return {
    "X-Access-Key-Id": config.kissflow.accessKeyId,
    "X-Access-Key-Secret": config.kissflow.accessKeySecret
  };
}

function fixKey(key, dataformId) {
  return String(key || "").replace(/^undefined\//, `${dataformId}/`);
}

function allKeysForImage(image, dataformId) {
  const keys = new Set();

  if (image?.key) keys.add(fixKey(image.key, dataformId));

  for (const photo of image?.photos || []) {
    if (photo?.key) keys.add(fixKey(photo.key, dataformId));
  }

  return Array.from(keys);
}

function candidateUrls({ baseUrl, accountId, key, attachmentId, instanceId, filename, dataformId }) {
  return [
    `${baseUrl}/${key}`,
    `${baseUrl}/download/${key}`,
    `${baseUrl}/download?key=${encodeURIComponent(key)}`,
    `${baseUrl}/attachment/2/${accountId}/${key}`,
    `${baseUrl}/attachment/2/${accountId}?key=${encodeURIComponent(key)}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/${attachmentId}/${encodeURIComponent(filename)}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/attachment/${attachmentId}/${encodeURIComponent(filename)}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/file/${attachmentId}/${encodeURIComponent(filename)}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/download/${attachmentId}/${encodeURIComponent(filename)}`
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
  const dataformId = config.kissflowModels.companyLetterheadDataformId;
  const baseUrl = config.kissflow.baseUrl.replace(/\/+$/, "");

  for (const field of ["Logo_File", "Logo_File_Right"]) {
    const image = row[field];
    const keys = allKeysForImage(image, dataformId);

    console.log(`\n=== ${field} ===`);
    console.log("name:", image?.name || "");
    console.log("attachment id:", image?.id || "");
    console.log("instance id:", row._id || "");
    console.log("keys_count:", keys.length);

    for (const key of keys) {
      console.log(`\n--- probing key: ${key} ---`);

      for (const url of candidateUrls({
        baseUrl,
        accountId: config.kissflow.accountId,
        key,
        attachmentId: image?.id,
        instanceId: row._id,
        filename: image?.name || "",
        dataformId
      })) {
        const result = await probeUrl(url, config);
        console.log(JSON.stringify(result));

        if (result.ok && String(result.content_type).startsWith("image/")) {
          console.log("FOUND_IMAGE_URL:", url);
          return;
        }
      }
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
