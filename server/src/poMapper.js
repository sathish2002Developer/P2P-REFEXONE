const { escapeHtml } = require("./templateRenderer");

function valueAt(obj, path, fallback = "") {
  try {
    const value = path.split(".").reduce((acc, key) => acc?.[key], obj);
    return value === undefined || value === null || value === "" ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

function cleanCurrency(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).replace(/\s*INR\s*$/i, "").trim();
}

function formatDateDDMMYYYY(value) {
  if (!value) return "";

  const raw = String(value).trim();
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }

  return raw;
}

function numberToWords(num) {

  if (num === 0) return "Zero Only";

  const ones = [
      "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
      "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
      "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];

  const tens = [
      "", "", "Twenty", "Thirty", "Forty", "Fifty",
      "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  function convert(n) {
      let str = "";

      if (n >= 100) {
          str += ones[Math.floor(n / 100)] + " Hundred ";
          n %= 100;
      }

      if (n >= 20) {
          str += tens[Math.floor(n / 10)] + " ";
          n %= 10;
      }

      if (n > 0) {
          str += ones[n] + " ";
      }

      return str.trim();
  }

  let result = "";

  const crore = Math.floor(num / 10000000);
  num %= 10000000;

  const lakh = Math.floor(num / 100000);
  num %= 100000;

  const thousand = Math.floor(num / 1000);
  num %= 1000;

  const hundred = num;

  if (crore) result += convert(crore) + " Crore ";
  if (lakh) result += convert(lakh) + " Lakh ";
  if (thousand) result += convert(thousand) + " Thousand ";
  if (hundred) result += convert(hundred);

  return result.trim() + " Only";
}


// One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only

function mapPurchaseOrderTokens(po = {}) {
  const vendor = po.Vendor_Contact_Person || po.Vendor__Details || {};
  const pr = po.PR_Details_1 || {};

  

  return {
    po_number: po.Purchase_Order_Number || po.Purchase_Order_Number_1 || po.Name || "",
    po_date: formatDateDDMMYYYY(po.Purchase_Order_Date || po.PO_Date || po._created_at || ""),
    seller_company_name: vendor.Legal_Vendor_Name || po.Vendor_Name || po.Vendor_Name_1 || "",
    seller_registered_address: vendor.Registered_Address || po.Vendor_Address || po.Vendor_Address_1 || "",
    seller_gst_no: vendor.GST_Number || "",
    seller_pan_no: vendor.PAN_Number || "",
    seller_msme_no: vendor.MSME_Number || "",
    seller_contact_person: vendor.Contact_Person_Name || "",
    seller_email: vendor.Email_ID || po.Vendor_Email || "",
    seller_phone: vendor.Mobile_Number || "",
    vendor_code: po.Vendor_Code_PR || vendor.Vendor_ID || po.Vendor_code || po.Vendor_code_1 || "",
    ref_no: po.Quote_Number || po.PR_Number || "",
    ref_date: formatDateDDMMYYYY(po.Quote_Date || po.PR_Required_Date || pr.PR_Date || ""),
    subject: po.PO_Title || pr.PR_Title || po.PR__Title || po.Comments || "",
    // Canonical source for letterhead selection:
    // Company_Letterhead_Master_A00.Company_Code must match PO.Entity.
    // PR entity fields are fallback only.
    buyer_company_code: po.LoggedUserEntity || po.Entity_1 || "",
    buyer_company_name: po.LoggedUserEntity || po.Entity || po.PR_Entity_code || po.PR_Entity || po.PR_Entity_1 || "",
    mode_of_shipment: po.Shipment_Mode || "",
    grand_total: cleanCurrency(po.Grand_Total || po.Total || ""),
    subtotal: cleanCurrency(po.Subtotal || po.Total || ""),
    total_tax_amount: cleanCurrency(po.Total_Tax_Amount || ""),
    amount_in_words: numberToWords(po.Grand_Total || po.Total || 0),
    scope_of_work: po.Comments || pr.Business_Justification || "",
    supply_work_schedule: po.Delivery_Date_1 ? `Delivery Date: ${formatDateDDMMYYYY(po.Delivery_Date_1)}` : "",
    payment_terms: po.Payment_Terms_2 || "",
    mutual_resolution_period_days: "7",
    arbitration_city: "Chennai",
    jurisdiction_city: "Chennai",
    vendor_liability_cap_percentage: "100",
    termination_notice_days: "30",
    governing_country: "India"
  };
}

function mapLineItems(po = {}, lineItemsTableKey = "Table::Copy_PR_Line_Items") {
  const rows = po[lineItemsTableKey] || [];

  return rows.map((row, index) => ({
    si_no: index + 1,
    item_Name: row.Item_Name_3 || row.Item_Name_2 || row.Item_Name_1 || row.Item_Name || "",
    description: row.Description_1 || row._id || "",
    uom: row.UOM_1 || row.UOM || row.UOM_2 || "",
    quantity: row.Qty_2|| "",
    unit_rate: cleanCurrency(row.Estimated_Unit_Price || row.Unit_Price_2 || row.Unit_Price_1 || row.Unit_Price || ""),
    tax_percentage: row.GST_1 || row.Tax_Percentage_2 || row.Tax_Percentage_1 || row.Tax_Percentage || row.Tax || "",
    tax_amount: cleanCurrency(row.TAX_Amount || row.Tax_Amount_2 || row.Tax_Amount_1 || row.Tax_Amount || ""),
    total_amount: cleanCurrency(row.Line_Total_1 || row.Total_Cost_2 || row.Total_Cost_1 || row.Total_Cost || "")
  }));
}

function optionalPoLine(label, value) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(clean)}</p>`;
}

function optionalRefLine(refNo, refDate) {
  const cleanRef = String(refNo ?? "").trim();
  const cleanDate = String(refDate ?? "").trim();
  if (!cleanRef && !cleanDate) return "";
  if (cleanRef && cleanDate) {
    return `<p><strong>Ref.No:</strong> ${escapeHtml(cleanRef)} / <strong>Date:</strong> ${escapeHtml(cleanDate)}</p>`;
  }
  if (cleanRef) return `<p><strong>Ref.No:</strong> ${escapeHtml(cleanRef)}</p>`;
  return `<p><strong>Date:</strong> ${escapeHtml(cleanDate)}</p>`;
}

function buildPriceScheduleHtml(lineItems = [], totals = {}) {
  const rowsHtml = lineItems.map((item) => `
    <tr>
      <td class="seq">${escapeHtml(item.si_no)}</td>
     <td>
    <strong>${escapeHtml(item.item_Name)}</strong><br>
    ${escapeHtml(item.description)}
</td>
      <td>${escapeHtml(item.uom || "-")}</td>
      <td class="num">${escapeHtml(item.quantity)}</td>
      <td class="num">${escapeHtml(item.unit_rate)}</td>
      <td class="num">${escapeHtml(item.tax_percentage || "-")}</td>
      <td class="num">${escapeHtml(item.tax_amount || "0")}</td>
      <td class="num">${escapeHtml(item.total_amount)}</td>
    </tr>
  `).join("");

  return `
    <h2>PRICE SCHEDULE</h2>
    <table class="price-table">
      <thead>
        <tr>
          <th class="seq">SI.No</th>
          <th>Description Of Work</th>
          <th>UOM</th>
          <th>Qty</th>
          <th>Unit Rate Rs.</th>
          <th>Tax Percentage</th>
          <th>Tax Amount</th>
          <th>TOTAL Amt Rs.</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr>
          <td colspan="7" class="total-label">SubTotal</td>
          <td class="num">${escapeHtml(totals.subtotal || "")}</td>
        </tr>
        <tr>
          <td colspan="7" class="total-label">Add: GST extra Amount</td>
          <td class="num">${escapeHtml(totals.total_tax_amount || "0")}</td>
        </tr>
        <tr>
          <td colspan="7" class="total-label">GrandTotal</td>
          <td class="num">${escapeHtml(totals.grand_total || "")}</td>
        </tr>
        <tr>
          <td colspan="2" class="total-label">Amount In Words:</td>
          <td colspan="6">${escapeHtml(totals.amount_in_words || "")}</td>
        </tr>
      </tbody>
    </table>
  `;
}


function buildSpecialNotesHtml(po = {}, tokens = {}) {
  const buyerCompanyName = tokens.buyer_company_name || tokens.buyer_company_code || "";
  const sellerCompanyName = tokens.seller_company_name || "";

  return `
    <section class="section page-break-before special-notes">
      <h2>SPECIAL NOTES (if any):</h2>

      <p><strong>Site Address:</strong><br>${escapeHtml(po.Delivery_Location || "")}</p>

      <p>
        <strong>Contact person at the site:</strong>
        Name: ${escapeHtml(po.Site_Contact_Person || "")}
        Email: ${escapeHtml(po.Site_Contact_Email || "")}
        Phone: ${escapeHtml(po.Site_Contact_Phone || "")}
      </p>

      <p>
        <strong>Project Manager at the Head Office:</strong>
        Name: ${escapeHtml(po.Project_Manager_Name || "")}
        Email: ${escapeHtml(po.Project_Manager_Email || "")}
        Phone: ${escapeHtml(po.Project_Manager_Phone || "")}
      </p>

      <p><strong>Invoicing address:</strong><br>${escapeHtml(po.Invoicing_Address || "")}</p>

      <p>
        <strong>Original Invoice to be sent to:</strong><br>
        Refex Group of Companies,<br>
        67, Bazullah Road, Parthasarathi Puram, T. Nagar, Chennai, Tamil Nadu – 600 017.
      </p>

      <p>
        Contact person: Name:${escapeHtml(po.CreatedBy || po._created_by?.Name || "")},
        Contact Number: ${escapeHtml(po.Created_By_Phone || "")},<br>
        E-Mail: ${escapeHtml(po.Vendor_Email || "")}
      </p>

      <p><strong>For ${escapeHtml(buyerCompanyName)},</strong></p>

      <div class="scm-signature-slot"></div>

      <p>
        <strong>Authorized Signatory</strong><br>
        Name: Mr. Rajeev Vaze<br>
        Designation: Head – SCM
      </p>
    </section>

    <section class="section page-break-before seller-acknowledgment">
      <h2>Acknowledgment and Acceptance by Seller/Supplier</h2>

      <p>
        We received, read, and understood the terms and conditions mentioned in this order.
        We hereby acknowledge, confirm and accept the above terms and conditions and the same
        shall be binding on us as “Seller”.
      </p>

      <p><strong>For ${escapeHtml(sellerCompanyName)},</strong></p>

      <div style="height:55px;"></div>

      <p>
        Authorized Signatory:<br>
        Dated:<br>
        Place:
      </p>
    </section>
  `;
}

function buildPurchaseOrderBodyHtml(po = {}, config = {}) {
  const lineItemsTableKey = `Table::${config.lineItemsTableId || "Model_D1wv4eeZCS"}`;
  const tokens = mapPurchaseOrderTokens(po);
  const lineItems = mapLineItems(po, lineItemsTableKey);

  const toSection = `
    <div class="po-to-box">
      <div class="meta-line">
        <span><strong>Purchase Order Number:</strong> ${escapeHtml(tokens.po_number)}</span>
        <span class="right"><strong>Date:</strong> ${escapeHtml(tokens.po_date)}</span>
      </div>

      <p><strong>To</strong></p>
      <p>
        ${escapeHtml(tokens.seller_company_name)}<br>
        ${escapeHtml(tokens.seller_registered_address)}
      </p>
      ${optionalPoLine("Vendor Code", tokens.vendor_code)}
      ${optionalPoLine("GST No", tokens.seller_gst_no)}
      ${optionalPoLine("PAN No", tokens.seller_pan_no)}
      ${optionalPoLine("MSME Details", tokens.seller_msme_no)}
      ${optionalRefLine(tokens.ref_no, tokens.ref_date)}
      ${optionalPoLine("Subject", tokens.subject)}
      ${optionalPoLine("Contact Person", tokens.seller_contact_person)}
      ${optionalPoLine("Email of the contact person", tokens.seller_email)}
      ${optionalPoLine("Mobile number of the contact person", tokens.seller_phone)}
    </div>
  `;

  const priceSchedule = buildPriceScheduleHtml(lineItems, tokens);

  return {
    title: "PURCHASE ORDER",
    bodyHtml: `${toSection}${priceSchedule}`,
    specialNotesHtml: buildSpecialNotesHtml(po, tokens),
    tokenData: tokens,
    lineItems
  };
}


function mapProcessTermsRows(po = {}, startSequenceNo = 1) {
  const rows = po["Table::TERMS__CONDITIONS"] || [];

  return rows
    .map((row, index) => ({
      sequence_no: startSequenceNo + index,
      term_header: row.Term_Header || "",
      term_description: row.Term_Description || "",
      source_row_id: row._id || null,
      source: "purchase_order_process"
    }))
    .filter((row) => row.term_header || row.term_description);
}

function mapProcessAnnexureRows(po = {}, startSequenceNo = 1) {
  const rows = po["Table::ANNEXURE"] || [];

  return rows
    .map((row, index) => ({
      sequence_no: startSequenceNo + index,
      header: row.Term_Header_1 || "",
      terms_and_conditions: row.Term_Description_1 || "",
      clause_code: "",
      page_break_after: false,
      source_row_id: row._id || null,
      source: "purchase_order_process"
    }))
    .filter((row) => row.header || row.terms_and_conditions);
}

module.exports = {
  valueAt,
  cleanCurrency,
  formatDateDDMMYYYY,
  mapPurchaseOrderTokens,
  mapLineItems,
  mapProcessTermsRows,
  mapProcessAnnexureRows,
  buildPriceScheduleHtml,
  buildSpecialNotesHtml,
  buildPurchaseOrderBodyHtml
};
