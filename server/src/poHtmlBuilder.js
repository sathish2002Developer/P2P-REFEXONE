const { renderTemplate, escapeHtml } = require("./templateRenderer");

function renderRows(rows = "", data = {}) {
  if (!Array.isArray(rows)) return "";

  return rows
    .filter((row) => row && row.is_included !== false)
    .sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
    .map((row) => rowMapper(row, data))
    .join("");
}

function rowMapper(row, data) {
  const header = escapeHtml(row.term_header || row.header || "");
  const descriptionTemplate = row.term_description || row.terms_and_conditions || "";
  const description = renderTemplate(descriptionTemplate, data, { missingTokenMode: "keep" });

  return `
    <tr>
      <td class="seq">${escapeHtml(row.sequence_no || "")}</td>
      <td class="head">${header}</td>
      <td>${description}</td>
    </tr>
  `;
}

function buildTermsTable(rows = [], data = {}) {
  return `
    <section class="section">
      <h2>Terms and Conditions</h2>
      <table class="terms-table">
        <tbody>
          ${renderRows(rows, data)}
        </tbody>
      </table>
    </section>
  `;
}

function buildAnnexureITable(rows = [], data = {}) {
  return `
    <section class="section page-break-before">
      <h2>ANNEXURE-I</h2>
      <h3>COMMERCIAL TERMS AND CONDITIONS</h3>
      <table class="annexure-table">
        <thead>
          <tr>
            <th class="seq">S.NO.</th>
            <th class="head">HEADERS</th>
            <th>TERMS AND CONDITIONS</th>
          </tr>
        </thead>
        <tbody>
          ${renderRows(rows, data)}
        </tbody>
      </table>
    </section>
  `;
}

function buildPoHtml({ title = "PURCHASE ORDER", bodyHtml = "", terms = [], annexureI = [], tokenData = {}, afterAnnexureHtml = "" }) {
  const renderedBody = renderTemplate(bodyHtml, tokenData, { missingTokenMode: "keep" });

  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page {
      size: A4;
    }

    body {
      font-family: Arial, sans-serif;
      font-size: 11px;
      color: #111;
      line-height: 1.35;
    }

    h1 {
      text-align: center;
      font-size: 18px;
      margin: 0 0 18px 0;
      letter-spacing: 0.5px;
    }

    h2 {
      font-size: 14px;
      margin: 18px 0 8px 0;
    }

    h3 {
      text-align: center;
      font-size: 12px;
      margin: 4px 0 12px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: auto;
    }

    tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }

    th, td {
      border: 1px solid #111;
      padding: 6px;
      vertical-align: top;
    }

    th {
      text-align: center;
      font-weight: bold;
    }

    .seq {
      width: 8%;
      text-align: center;
    }

    .head {
      width: 24%;
      font-weight: bold;
    }

    .section {
      margin-top: 16px;
    }

    .page-break-before {
      page-break-before: always;
    }

    .po-body {
      margin-bottom: 16px;
    }

    .po-to-box {
      border: 1px solid #111;
      padding: 8px 10px;
      margin-bottom: 14px;
    }

    .po-to-box p {
      margin: 4px 0;
    }

    .meta-line {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .right {
      float: right;
      text-align: right;
    }

    .num {
      text-align: right;
      white-space: nowrap;
    }

    .total-label {
      text-align: right;
      font-weight: bold;
    }

    .special-notes,
    .seller-acknowledgment {
      border: 1px solid #111;
      padding: 10px 12px;
      margin-top: 14px;
      box-sizing: border-box;
      page-break-inside: avoid;
    }

    .special-notes h2,
    .seller-acknowledgment h2 {
      margin-top: 0;
      margin-bottom: 12px;
      font-size: 15px;
      font-weight: 700;
    }

    .special-notes p,
    .seller-acknowledgment p {
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
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
