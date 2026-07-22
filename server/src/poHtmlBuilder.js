const { renderTemplate, escapeHtml } = require("./templateRenderer");

function renderSingleAnnexureRow(row, data = {}) {
  const header = escapeHtml(row.term_header || row.header || "");
  const descriptionTemplate = row.term_description || row.terms_and_conditions || "";
  const description = renderTemplate(descriptionTemplate, data, { missingTokenMode: "keep" });

  return `
    <tr>
      <td class="sno-col">${escapeHtml(row.sequence_no || "")}</td>
      <td class="header-col"><strong>${header}</strong></td>
      <td class="desc-col"><div class="desc-flow">${description}</div></td>
    </tr>
  `;
}

function renderSingleTermsRow(row, data = {}) {
  const header = escapeHtml(row.term_header || row.header || "");
  const descriptionTemplate = row.term_description || row.terms_and_conditions || "";
  const description = renderTemplate(descriptionTemplate, data, { missingTokenMode: "keep" });

  return `
    <tr>
      <th class="head-col">${header}</th>
      <td class="desc-col"><div class="desc-flow">${description}</div></td>
    </tr>
  `;
}

function sortedRows(rows = []) {
  return rows
    .filter((row) => row && row.is_included !== false)
    .sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0));
}

const annexureHeadRow = `
  <tr>
    <th class="sno-col">S.NO.</th>
    <th style="width:14%">HEADERS</th>
    <th>TERMS AND CONDITIONS</th>
  </tr>
`;

function renderAnnexureRows(rows = "", data = {}) {
  if (!Array.isArray(rows)) return "";
  return sortedRows(rows).map((row) => renderSingleAnnexureRow(row, data)).join("");
}

function renderTermsRows(rows = [], data = {}) {
  if (!Array.isArray(rows)) return "";
  return sortedRows(rows).map((row) => renderSingleTermsRow(row, data)).join("");
}

function buildTermsTable(rows = [], data = {}) {
  const sorted = sortedRows(rows);
  if (!sorted.length) return "";

  return `
    <section class="terms-section">
      <table class="terms">
        <caption>Terms and Conditions</caption>
        <tbody>
          ${renderTermsRows(sorted, data)}
        </tbody>
      </table>
    </section>
  `;
}

function buildAnnexureITable(rows = [], data = {}) {
  const sorted = sortedRows(rows);
  if (!sorted.length) return "";

  return `
    <section class="annexure-section">
      <h2 class="annexure-title">ANNEXURE-I</h2>
      <h3 class="annexure-sub">COMMERCIAL TERMS AND CONDITIONS</h3>
      <table class="terms annexure-table">
        <thead>${annexureHeadRow}</thead>
        <tbody>
          ${renderAnnexureRows(sorted, data)}
        </tbody>
      </table>
    </section>
  `;
}

function buildPoStyles(_footerReserveMm = 50) {
  return `
    @page {
      size: A4;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12.5px;
      color: #1a1a1a;
      width: 100%;
      max-width: 100%;
      margin: 0;
      padding: 0;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .po-body,
    .terms-section,
    .annexure-section,
    .special-notes-section,
    .vendor-ack-section {
      padding-bottom: 2mm;
    }

    table.price,
    table.terms {
      width: 100%;
      border-collapse: collapse;
      border: none;
      page-break-inside: auto;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    table.price th,
    table.price td,
    table.terms th,
    table.terms td {
      border: 1px solid #000;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    table.price caption,
    table.terms caption {
      border: 1px solid #000;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }

    .desc-flow {
      page-break-inside: auto;
      break-inside: auto;
    }

    table.terms tbody tr,
    table.annexure-table tbody tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    table.annexure-table tbody tr td.desc-col,
    table.terms tbody tr td.desc-col {
      page-break-inside: auto;
      break-inside: auto;
    }

    table.annexure-table tbody tr td.sno-col,
    table.annexure-table tbody tr td.header-col,
    table.terms tbody tr th.head-col {
      page-break-inside: avoid;
      break-inside: avoid;
      vertical-align: top;
    }

    .title {
      text-align: center;
      font-weight: bold;
      font-size: 16px;
      letter-spacing: 1px;
      margin: 2px 0 12px 0;
    }

    .po-meta {
      display: table;
      width: 100%;
      font-weight: bold;
      margin-bottom: 10px;
      font-size: 13px;
    }
    .po-meta span:first-child {
      display: table-cell;
      text-align: left;
      width: 50%;
    }
    .po-meta span:last-child {
      display: table-cell;
      text-align: right;
      width: 50%;
    }

    .info-box {
      border: 1px solid #000;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .info-box p { margin: 3px 0; }
    .info-box a { color: #1155cc; text-decoration: underline; }

    table.price {
      margin-bottom: 0;
    }
    table.price caption {
      padding: 5px;
      font-weight: bold;
      text-align: center;
      background: #f2f2f2;
      caption-side: top;
    }
    table.price th, table.price td {
      padding: 6px 8px;
      vertical-align: top;
      font-size: 12px;
    }
    table.price th { background: #f2f2f2; text-align: center; }
    table.price td.center { text-align: center; }
    table.price td.right { text-align: right; }
    table.price tr.total td { font-weight: bold; }
    table.price .spec-block p { margin: 6px 0; }
    table.price .spec-title { font-weight: bold; text-decoration: underline; margin-top: 10px; }
    table.price tbody tr { page-break-inside: avoid; break-inside: avoid; }

    .amount-words {
      border: 1px solid #000;
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      font-size: 12.5px;
      margin-bottom: 16px;
      page-break-inside: avoid;
      break-inside: avoid;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    .amount-words .label { font-weight: bold; white-space: nowrap; margin-right: 10px; }
    .amount-words .value { font-weight: bold; text-align: right; }

    .terms-section,
    .annexure-section,
    .special-notes-section,
    .vendor-ack-section {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
    }

    table.terms {
      margin-top: 0;
    }
    table.terms caption {
      font-weight: bold;
      padding: 6px;
      background: #f2f2f2;
      caption-side: top;
      page-break-after: avoid;
      break-after: avoid;
    }
    table.terms thead {
      display: table-header-group;
    }
    table.terms tbody {
      display: table-row-group;
    }
    table.terms th, table.terms td {
      padding: 7px 9px;
      vertical-align: top;
      text-align: left;
    }
    table.terms th { background: #f2f2f2; }
    table.terms td.head-col, table.terms th.head-col { width: 15%; font-weight: bold; }
    table.terms td.sno-col, table.terms th.sno-col { width: 6%; text-align: center; }
    table.annexure-table td.header-col { width: 14%; font-weight: bold; vertical-align: top; }
    table.annexure-table td:last-child,
    table.terms td:last-child {
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    h2.annexure-title {
      text-align: center;
      margin: 0 0 4px 0;
      font-size: 15px;
      page-break-after: avoid;
      break-after: avoid;
    }
    h3.annexure-sub {
      text-align: center;
      margin: 0 0 14px 0;
      font-size: 13px;
      page-break-after: avoid;
      break-after: avoid;
    }

    .special-notes {
      border: 1px solid #000;
      padding: 12px 16px;
      margin-top: 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .special-notes p { margin: 6px 0; }
    .special-notes .lbl { font-weight: bold; }
    .special-notes a { color: #1155cc; text-decoration: underline; }
    .sig-space { height: 60px; }

    .ack-box {
      border: 1px solid #000;
      padding: 12px 16px;
      margin-top: 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .ack-box .sig-gap { height: 70px; }

    .po-body {
      margin-bottom: 16px;
    }
  `;
}

function buildPoHtml({
  title = "PURCHASE ORDER",
  bodyHtml = "",
  terms = [],
  annexureI = [],
  tokenData = {},
  afterAnnexureHtml = "",
  footerReserveMm = 50
}) {
  const renderedBody = renderTemplate(bodyHtml, tokenData, { missingTokenMode: "keep" });

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${buildPoStyles(footerReserveMm)}</style>
</head>
<body>
  <div class="title">${escapeHtml(title)}</div>
  <section class="po-body">
    ${renderedBody}
  </section>
  ${buildTermsTable(terms, tokenData)}
  ${buildAnnexureITable(annexureI, tokenData)}
  ${afterAnnexureHtml || ""}
</body>
</html>
`;
}

module.exports = {
  buildPoHtml,
  buildTermsTable,
  buildAnnexureITable
};
