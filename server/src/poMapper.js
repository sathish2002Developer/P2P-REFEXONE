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

function numberToWords(amount) {
    amount = String(amount).replace(/,/g, ""); // Remove commas
    amount = parseFloat(amount);

    if (isNaN(amount)) return "";

    const rupees = Math.floor(amount);
    const paise = Math.round((amount - rupees) * 100);

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

    function convertIndian(num) {
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

        return result.trim();
    }

    let words = "";

    if (rupees === 0) {
        words = "Zero Rupees";
    } else {
        words = convertIndian(rupees) + " Rupees";
    }

    if (paise > 0) {
        words += " and " + convert(paise) + " Paise";
    } else {
        words += " and Zero Paisa";
    }

    return words + " Only.";
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
    buyer_company_code:  po.Entity_1 || "",
    buyer_company_name:  po.Entity_1 || po.PR_Entity_code || po.PR_Entity || po.PR_Entity_1 || "",
    mode_of_shipment: po.Shipment_Mode || "",
    grand_total: cleanCurrency(po.Grand_Total || po.Total || ""),
    subtotal: cleanCurrency(po.Subtotal || po.Total || ""),
    total_tax_amount: cleanCurrency(po.Total_Tax_amount || ""),
    amount_in_words: numberToWords(cleanCurrency(po.Grand_Total || po.Total || 0)),
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

function optionalPoLine(label, value, { isEmail = false } = {}) {
  const clean = String(value ?? "").trim();
  if (!clean) return "";
  const content = isEmail
    ? `<a href="mailto:${escapeHtml(clean)}">${escapeHtml(clean)}</a>`
    : escapeHtml(clean);
  return `<p><strong>${escapeHtml(label)}:</strong> ${content}</p>`;
}

function optionalRefLine(refNo, refDate) {
  const cleanRef = String(refNo ?? "").trim();
  const cleanDate = String(refDate ?? "").trim();
  if (!cleanRef && !cleanDate) return "";
  if (cleanRef && cleanDate) {
    return `<p><strong>Ref.No/Date.</strong> 1.Quote No.: ${escapeHtml(cleanRef)}., Date: ${escapeHtml(cleanDate)}.</p>`;
  }
  if (cleanRef) return `<p><strong>Ref.No/Date.</strong> 1.Quote No.: ${escapeHtml(cleanRef)}.</p>`;
  return `<p><strong>Ref.No/Date.</strong> Date: ${escapeHtml(cleanDate)}.</p>`;
}

function formatLineItemDescription(item = {}) {
  const name = String(item.item_Name ?? "").trim();
  const description = String(item.description ?? "").trim();
  const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(description);

  const nameHtml = name ? `<p>${escapeHtml(name)}</p>` : "";
  let descriptionHtml = "";

  if (description) {
    descriptionHtml = looksLikeHtml ? description : `<p>${escapeHtml(description)}</p>`;
  }

  return `<div class="spec-block">${nameHtml}${descriptionHtml}</div>`;
}

function resolveGstLabel(lineItems = [], po = {}) {
  const explicit = String(po.GST_Label || po.Tax_Label || "").trim();
  if (explicit) return explicit;

  const percentages = [...new Set(
    lineItems
      .map((item) => String(item.tax_percentage ?? "").replace(/[^\d.]/g, "").trim())
      .filter(Boolean)
  )];

  if (percentages.length === 1) {
    return `GST@${percentages[0]}% Extra`;
  }

  return "GST Extra";
}

function buildPriceScheduleHtml(lineItems = [], totals = {}, gstLabel = "GST Extra") {
  const rowsHtml = lineItems.map((item) => `
    <tr>
      <td class="center">${escapeHtml(item.si_no)}</td>
      <td>${formatLineItemDescription(item)}</td>
      <td class="center">${escapeHtml(item.uom || "No's")}</td>
      <td class="center">${escapeHtml(item.quantity)}</td>
      <td class="right">${escapeHtml(item.unit_rate)}</td>
      <td class="right">${escapeHtml(item.total_amount)}</td>
    </tr>
  `).join("");

  return `
    <table class="price">
      <caption>PRICE SCHEDULE</caption>
      <tr>
        <th style="width:6%">SI.No</th>
        <th>Description Of Work</th>
        <th style="width:8%">UOM</th>
        <th style="width:6%">Qty</th>
        <th style="width:14%">Unit Rate Rs.</th>
        <th style="width:14%">TOTAL Amt Rs.</th>
      </tr>
      ${rowsHtml}
      <tr class="total">
        <td colspan="5">SubTotal</td>
        <td class="right">${escapeHtml(totals.subtotal || "")}</td>
      </tr>
      <tr class="total">
        <td colspan="5">Add: ${escapeHtml(gstLabel)}</td>
        <td class="right">${escapeHtml(totals.total_tax_amount || "0")}</td>
      </tr>
      <tr class="total">
        <td colspan="5">GrandTotal</td>
        <td class="right">${escapeHtml(totals.grand_total || "")}</td>
      </tr>
    </table>
    <div class="amount-words">
      <span class="label">Amount In Words:</span>
      <span class="value">${escapeHtml(totals.amount_in_words || "")}</span>
    </div>
  `;
}


function buildSpecialNotesHtml(po = {}, tokens = {}) {
  const buyerCompanyName = tokens.buyer_company_name || tokens.buyer_company_code || "";
  const sellerCompanyName = tokens.seller_company_name || "";
  const signatoryDate = formatDateDDMMYYYY(po.PO_Signatory_Date || po.Purchase_Order_Date || po._modified_at || "");
  const signatoryTime = String(po.PO_Signatory_Time || "").trim();

  const siteContactEmail = String(po.Site_Contact_Email || "").trim();
  const siteContactEmailHtml = siteContactEmail
    ? `<a href="mailto:${escapeHtml(siteContactEmail)}">${escapeHtml(siteContactEmail)}</a>`
    : "";

  const pmEmail = String(po.Project_Manager_Email || "").trim();
  const pmEmailHtml = pmEmail
    ? `<a href="mailto:${escapeHtml(pmEmail)}">${escapeHtml(pmEmail)}</a>`
    : "";

  const invoiceContactEmail = String(po.Invoice_Contact_Email || po.Created_By_Email || "").trim();
  const invoiceContactEmailHtml = invoiceContactEmail
    ? `<a href="mailto:${escapeHtml(invoiceContactEmail)}">${escapeHtml(invoiceContactEmail)}</a>`
    : "";

  return `
    <section class="special-notes-section">
    <div class="special-notes">
      <p><strong>SPECIAL NOTES (if any):</strong></p>

      <p><span class="lbl">Site Address:</span>${escapeHtml(po.Delivery_Location || "")}</p>

      <p><span class="lbl">Contact person at the site:</span> Name:${escapeHtml(po.Site_Contact_Person || "")}, Phone: ${escapeHtml(po.Site_Contact_Phone || "")},</p>
      ${siteContactEmail ? `<p>Email: ${siteContactEmailHtml}</p>` : ""}

      <p><span class="lbl">Project Manager at the head office:</span> ${escapeHtml(po.Project_Manager_Name || "")}${po.Project_Manager_Phone ? `, Phone:${escapeHtml(po.Project_Manager_Phone)},` : ""}<br>
      ${pmEmail ? `Email: ${pmEmailHtml}` : ""}</p>

      <p><span class="lbl">Invoicing address:</span><br>${escapeHtml(po.Invoicing_Address || "")}</p>

      <p><span class="lbl">Original invoice to be sent at:</span></p>
      <p><strong>Refex Group of Companies,</strong><br>
      67, Bazullah Road, Parthasarathi Puram, T. Nagar, Chennai, Tamil Nadu – 600 017.<br>
      <span class="lbl">Contact person:</span> Name:${escapeHtml(po.Invoice_Contact_Name || po.CreatedBy || po._created_by?.Name || "")}, Contact Number:${escapeHtml(po.Invoice_Contact_Phone || po.Created_By_Phone || "")},<br>
      ${invoiceContactEmail ? `E-Mail: ${invoiceContactEmailHtml}` : ""}</p>

      <p><strong>FOR ${escapeHtml(buyerCompanyName)},</strong></p>
      <div class="sig-space"></div>
      <p>${signatoryDate ? `${escapeHtml(signatoryDate)} ${escapeHtml(signatoryTime)}`.trim() + "<br>" : ""}
      <strong>Authorized Signatory</strong><br>
      Name: Mr. Rajeev Vaze<br>
      Designation: Head – SCM</p>
    </div>

    <div class="ack-box">
      <p><strong>Acknowledgment and Acceptance by Seller/Supplier</strong></p>
      <p>We received, read, and understood the terms and conditions mentioned in this order. We hereby acknowledge, confirm and accept the above terms and conditions and the same shall be binding on us as &ldquo;Seller&rdquo;.</p>
      <p><strong>FOR ${escapeHtml(sellerCompanyName)},</strong></p>
      <div class="sig-gap"></div>
      <p><strong>Authorized Signatory</strong><br>
      <strong>Dated:</strong><br>
      <strong>Place:</strong></p>
    </div>
    </section>
  `;
}

function buildPurchaseOrderBodyHtml(po = {}, config = {}) {
  const lineItemsTableKey = `Table::${config.lineItemsTableId || "Model_D1wv4eeZCS"}`;
  const tokens = mapPurchaseOrderTokens(po);
  const lineItems = mapLineItems(po, lineItemsTableKey);
  const gstLabel = resolveGstLabel(lineItems, po);

  const toSection = `
    <div class="po-meta">
      <span>Purchase Order No. &nbsp;${escapeHtml(tokens.po_number)}</span>
      <span>Date:${escapeHtml(tokens.po_date)}</span>
    </div>

    <div class="info-box">
      <p><strong>To</strong></p>
      <p><strong>${escapeHtml(tokens.seller_company_name)}${tokens.seller_company_name ? "," : ""}</strong></p>
      <p>${escapeHtml(tokens.seller_registered_address)}</p>
      ${optionalPoLine("GST No", tokens.seller_gst_no)}
      ${optionalPoLine("PAN No", tokens.seller_pan_no)}
      ${optionalPoLine("MSME Details", tokens.seller_msme_no)}
      <p>&nbsp;</p>
      ${optionalRefLine(tokens.ref_no, tokens.ref_date)}
      <p>&nbsp;</p>
      ${optionalPoLine("Subject", tokens.subject)}
      <p>&nbsp;</p>
      ${optionalPoLine("Contact Person", tokens.seller_contact_person)}
      ${optionalPoLine("Email of contact person", tokens.seller_email, { isEmail: true })}
      ${optionalPoLine("Mobile no of contact person", tokens.seller_phone)}
    </div>
  `;

  const priceSchedule = buildPriceScheduleHtml(lineItems, tokens, gstLabel);

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
