const fs = require("fs/promises");
const path = require("path");
const { getConfig } = require("./config");
const { buildPurchaseOrderBodyHtml } = require("./poMapper");
const { buildPoHtml } = require("./poHtmlBuilder");
const { renderHtmlToPdfBuffer } = require("./pdfRenderer");

async function main() {
  const config = getConfig();

  const saved = JSON.parse(
    await fs.readFile("server/tmp/po-instance-PkDNlMK5eQZH.json", "utf8")
  );

  const po = saved.data;

  const mapped = buildPurchaseOrderBodyHtml(po, {
    lineItemsTableId: config.kissflowModels.purchaseOrderLineItemsTableId
  });

  const html = buildPoHtml({
    title: mapped.title,
    bodyHtml: mapped.bodyHtml,
    terms: [
      {
        sequence_no: 1,
        term_header: "Scope of work",
        term_description: "{{scope_of_work}}"
      },
      {
        sequence_no: 2,
        term_header: "Payment Terms",
        term_description: "{{payment_terms}}"
      }
    ],
    annexureI: [],
    tokenData: mapped.tokenData
  });

  const outputDir = path.resolve("server/tmp");
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, "po-mapper-smoke-test.html"), html, "utf8");

  const pdfBuffer = await renderHtmlToPdfBuffer({
    html,
    footerHtml: `<div style="width:100%; font-size:9px; text-align:center;">Refex P2P Dynamic PDF - <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    marginTopMm: 15,
    marginBottomMm: 18
  });

  await fs.writeFile(path.join(outputDir, "po-mapper-smoke-test.pdf"), pdfBuffer);

  console.log(JSON.stringify({
    ok: true,
    instance_id: po._id,
    title: mapped.title,
    line_items_count: mapped.lineItems.length,
    html_output: path.join(outputDir, "po-mapper-smoke-test.html"),
    pdf_output: path.join(outputDir, "po-mapper-smoke-test.pdf"),
    pdf_bytes: pdfBuffer.length
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message
  }, null, 2));
  process.exit(1);
});
