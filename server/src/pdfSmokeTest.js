const fs = require("fs/promises");
const path = require("path");
const { renderHtmlToPdfBuffer } = require("./pdfRenderer");

async function main() {
  const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111827; }
    h1 { text-align: center; font-size: 18px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th, td { border: 1px solid #111827; padding: 8px; vertical-align: top; }
    th { background: #e5e7eb; }
  </style>
</head>
<body>
  <h1>WORK ORDER</h1>
  <p><strong>Work Order No.</strong> TEST-WO-001</p>
  <p><strong>To:</strong> Test Vendor Private Limited</p>

  <table>
    <thead>
      <tr>
        <th>SI.NO</th>
        <th>Description Of Items</th>
        <th>UOM</th>
        <th>Qty</th>
        <th>Unit Rate Rs.</th>
        <th>Total Amt Rs.</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>Reserved parking service for Minerva Parking</td>
        <td>Month</td>
        <td>1</td>
        <td>10000.00</td>
        <td>10000.00</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  const footerHtml = `
<div style="width:100%; font-size:9px; text-align:center; color:#374151;">
  Refex Dynamic PDF Smoke Test - <span class="pageNumber"></span>/<span class="totalPages"></span>
</div>`;

  const pdfBuffer = await renderHtmlToPdfBuffer({
    html,
    footerHtml,
    marginTopMm: 15,
    marginBottomMm: 18
  });

  const outputDir = path.resolve("server/tmp");
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, "smoke-test.pdf");
  await fs.writeFile(outputPath, pdfBuffer);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    bytes: pdfBuffer.length
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exit(1);
});
