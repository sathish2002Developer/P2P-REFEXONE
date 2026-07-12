const fs = require("fs/promises");
const path = require("path");
const { buildPoHtml } = require("./poHtmlBuilder");
const { renderHtmlToPdfBuffer } = require("./pdfRenderer");

async function main() {
  const tokenData = {
    work_order_no: "WO-DEV-001",
    buyer_company_name: "Refex Renewables & Infrastructure Limited",
    seller_company_name: "Test Vendor Private Limited",
    scope_of_work: "Reserved parking services for Minerva Parking.",
    supply_work_schedule: "Service to start from 01/06/2026.",
    payment_terms: "100% payment after successful monthly service completion.",
    mutual_resolution_period_days: "7",
    arbitration_city: "Chennai",
    jurisdiction_city: "Chennai",
    vendor_liability_cap_percentage: "100",
    termination_notice_days: "30",
    governing_country: "India"
  };

  const bodyHtml = `
    <p><strong>Work Order No.</strong> {{work_order_no}}</p>
    <p><strong>To:</strong> M/s. {{seller_company_name}}</p>
    <p><strong>Subject:</strong> Work Order for parking services</p>

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
          <td class="seq">1</td>
          <td>Reserved parking service</td>
          <td>Month</td>
          <td>1</td>
          <td>10000.00</td>
          <td>10000.00</td>
        </tr>
      </tbody>
    </table>
  `;

  const terms = [
    {
      sequence_no: 1,
      term_header: "Scope of work",
      term_description: "{{scope_of_work}}"
    },
    {
      sequence_no: 2,
      term_header: "Supply & Work Schedule",
      term_description: "{{supply_work_schedule}}"
    },
    {
      sequence_no: 3,
      term_header: "Payment Terms",
      term_description: "{{payment_terms}}"
    }
  ];

  const annexureI = [
    {
      sequence_no: 1,
      header: "Parties",
      terms_and_conditions: "This Work Order is issued by <strong>{{buyer_company_name}}</strong> hereinafter referred to as the Buyer to <strong>{{seller_company_name}}</strong> hereinafter referred to as the Seller or the Vendor. The Buyer & the Vendor will be referred to collectively as Parties to this contract.<br><br>This Work Order shall constitute the contract (“order”)."
    },
    {
      sequence_no: 5,
      header: "Dispute Resolution",
      terms_and_conditions: "Parties shall attempt resolution within {{mutual_resolution_period_days}} days. Arbitration shall be held in {{arbitration_city}}. Courts in {{jurisdiction_city}} shall have exclusive jurisdiction."
    },
    {
      sequence_no: 8,
      header: "Compliance with Applicable Law",
      terms_and_conditions: "The Vendor shall comply with all applicable laws, regulations and ordinances in force in {{governing_country}}."
    }
  ];

  const html = buildPoHtml({
    title: "WORK ORDER",
    bodyHtml,
    terms,
    annexureI,
    tokenData
  });

  const outputDir = path.resolve("server/tmp");
  await fs.mkdir(outputDir, { recursive: true });

  await fs.writeFile(path.join(outputDir, "po-smoke-test.html"), html, "utf8");

  const pdfBuffer = await renderHtmlToPdfBuffer({
    html,
    footerHtml: `<div style="width:100%; font-size:9px; text-align:center;">Refex P2P Dynamic PDF - <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    marginTopMm: 15,
    marginBottomMm: 18
  });

  await fs.writeFile(path.join(outputDir, "po-smoke-test.pdf"), pdfBuffer);

  console.log(JSON.stringify({
    ok: true,
    html_output: path.join(outputDir, "po-smoke-test.html"),
    pdf_output: path.join(outputDir, "po-smoke-test.pdf"),
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
