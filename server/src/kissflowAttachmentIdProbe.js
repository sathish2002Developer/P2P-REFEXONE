require("dotenv/config");
const fs = require("fs/promises");
const { getConfig } = require("./config");

function headers(config) {
  return {
    "X-Access-Key-Id": config.kissflow.accessKeyId,
    "X-Access-Key-Secret": config.kissflow.accessKeySecret,
    "Content-Type": "application/json"
  };
}

function candidateUrls({ baseUrl, accountId, dataformId, instanceId, attachmentId, filename }) {
  const file = encodeURIComponent(filename || "");

  return [
    `${baseUrl}/attachment/2/${accountId}/${attachmentId}`,
    `${baseUrl}/attachment/2/${accountId}/${attachmentId}/${file}`,
    `${baseUrl}/file/2/${accountId}/${attachmentId}`,
    `${baseUrl}/file/2/${accountId}/${attachmentId}/${file}`,

    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/attachment/${attachmentId}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/attachment/${attachmentId}/${file}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/file/${attachmentId}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/file/${attachmentId}/${file}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/download/${attachmentId}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/download/${attachmentId}/${file}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/files/${attachmentId}`,
    `${baseUrl}/form/2/${accountId}/${dataformId}/${instanceId}/files/${attachmentId}/${file}`,

    `${baseUrl}/process/2/${accountId}/admin/${dataformId}/${instanceId}/attachment/${attachmentId}`,
    `${baseUrl}/process/2/${accountId}/admin/${dataformId}/${instanceId}/attachment/${attachmentId}/${file}`,
    `${baseUrl}/process/2/${accountId}/admin/${dataformId}/${instanceId}/download/${attachmentId}`,
    `${baseUrl}/process/2/${accountId}/admin/${dataformId}/${instanceId}/download/${attachmentId}/${file}`
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

    const result = {
      url,
      status: response.status,
      ok: response.ok,
      content_type: contentType,
      content_length: contentLength
    };

    if (response.ok && String(contentType).startsWith("image/")) {
      result.found = true;
    }

    return result;
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

  const baseUrl = config.kissflow.baseUrl.replace(/\/+$/, "");
  const accountId = config.kissflow.accountId;
  const dataformId = config.kissflowModels.companyLetterheadDataformId;
  const instanceId = row._id;

  let foundAny = false;

  for (const field of ["Logo_File", "Logo_File_Right"]) {
    const image = row[field];

    console.log(`\n=== ${field} ===`);
    console.log("name:", image?.name || "");
    console.log("attachment id:", image?.id || "");
    console.log("instance id:", instanceId);

    if (!image?.id) {
      console.log("No attachment id found");
      continue;
    }

    for (const url of candidateUrls({
      baseUrl,
      accountId,
      dataformId,
      instanceId,
      attachmentId: image.id,
      filename: image.name
    })) {
      const result = await probeUrl(url, config);
      console.log(JSON.stringify(result));

      if (result.found) {
        foundAny = true;
        console.log("FOUND_IMAGE_URL:", url);
        break;
      }
    }
  }

  if (!foundAny) {
    console.log("\nNO_BACKEND_DOWNLOADABLE_IMAGE_ROUTE_FOUND");
    console.log("Recommended fallback: store public URL text fields for header logos.");
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exit(1);
});
