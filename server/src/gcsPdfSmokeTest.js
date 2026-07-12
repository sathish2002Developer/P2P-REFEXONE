const { renderHtmlToPdfBuffer } = require("./pdfRenderer");
const { uploadPdfBuffer } = require("./gcs");

async function main() {
  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111827; }
    h1 { text-align: center; font-size: 18px; margin-bottom: 24px; }
    .box { border: 1px solid #111827; padding: 12px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>REFEX P2P DYNAMIC PDF</h1>
  <div class="box">
    <p><strong>Smoke Test:</strong> Render PDF and upload to GCS</p>
    <p><strong>Environment:</strong> DEV</p>
  </div>
</body>
</html>`;

  const pdfBuffer = await renderHtmlToPdfBuffer({
    html,
    footerHtml: `<div style="width:100%; font-size:9px; text-align:center;">Refex P2P PDF - <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    marginTopMm: 15,
    marginBottomMm: 18
  });

  const uploaded = await uploadPdfBuffer({
    buffer: pdfBuffer,
    objectName: `smoke-tests/${Date.now()}-uploaded-smoke-test.pdf`,
    metadata: {
      source: "gcsPdfSmokeTest",
      app_env: "dev"
    }
  });

  console.log(JSON.stringify({
    ok: true,
    bytes: pdfBuffer.length,
    bucket: uploaded.bucket,
    object_name: uploaded.objectName,
    gcs_uri: uploaded.gcsUri,
    signed_url_created: Boolean(uploaded.signedUrl)
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exit(1);
});
