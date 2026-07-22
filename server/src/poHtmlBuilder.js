const { renderTemplate, escapeHtml } = require("./templateRenderer");

function renderAnnexureRows(rows = "", data = {}) {
  if (!Array.isArray(rows)) return "";

  return rows
    .filter((row) => row && row.is_included !== false)
    .sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
    .map((row) => {
      const header = escapeHtml(row.term_header || row.header || "");
      const descriptionTemplate = row.term_description || row.terms_and_conditions || "";
      const description = renderTemplate(descriptionTemplate, data, { missingTokenMode: "keep" });

      return `
    <tr>
      <td class="sno-col">${escapeHtml(row.sequence_no || "")}</td>
      <td><strong>${header}</strong></td>
      <td>${description}</td>
    </tr>
  `;
    })
    .join("");
}

function renderTermsRows(rows = [], data = {}) {
  if (!Array.isArray(rows)) return "";

  return rows
    .filter((row) => row && row.is_included !== false)
    .sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0))
    .map((row) => {
      const header = escapeHtml(row.term_header || row.header || "");
      const descriptionTemplate = row.term_description || row.terms_and_conditions || "";
      const description = renderTemplate(descriptionTemplate, data, { missingTokenMode: "keep" });

      return `
    <tr>
      <th class="head-col">${header}</th>
      <td>${description}</td>
    </tr>
  `;
    })
    .join("");
}

function buildTermsTable(rows = [], data = {}) {
  return `
    <section class="terms-section">
      <table class="terms">
        <caption>Terms and Conditions</caption>
        ${renderTermsRows(rows, data)}
      </table>
    </section>
  `;
}

function buildAnnexureITable(rows = [], data = {}) {
  return `
    <section class="annexure-section">
      <h2 class="annexure-title">ANNEXURE-I</h2>
      <h3 class="annexure-sub">COMMERCIAL TERMS AND CONDITIONS</h3>
      <table class="terms">
        <tr>
          <th class="sno-col">S.NO.</th>
          <th style="width:14%">HEADERS</th>
          <th>TERMS AND CONDITIONS</th>
        </tr>
        ${renderAnnexureRows(rows, data)}
      </table>
    </section>
  `;
}

function buildPoStyles() {
  return `
    @page { size: A4; margin: 18mm 15mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12.5px;
      color: #1a1a1a;
      max-width: 850px;
      margin: 0 auto;
      padding: 0;
      line-height: 1.4;
    }

    .title {
      text-align: center;
      font-weight: bold;
      font-size: 16px;
      letter-spacing: 1px;
      margin: 10px 0 14px 0;
    }

    .po-meta {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      margin-bottom: 10px;
      font-size: 13px;
    }

    .info-box {
      border: 1px solid #000;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .info-box p { margin: 3px 0; }
    .info-box a { color: #1155cc; text-decoration: underline; }

    table.price {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 0;
      page-break-inside: auto;
    }
    table.price caption {
      border: 1px solid #000;
      border-bottom: none;
      padding: 5px;
      font-weight: bold;
      text-align: center;
      background: #f2f2f2;
    }
    table.price th, table.price td {
      border: 1px solid #000;
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

    .amount-words {
      border: 1px solid #000;
      border-top: none;
      padding: 8px 10px;
      display: flex;
      justify-content: space-between;
      font-size: 12.5px;
      margin-bottom: 16px;
    }
    .amount-words .label { font-weight: bold; white-space: nowrap; margin-right: 10px; }
    .amount-words .value { font-weight: bold; text-align: right; }

    .terms-section {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
    }

    .annexure-section {
      page-break-before: always;
      break-before: page;
    }

    table.terms {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      page-break-inside: auto;
    }
    table.terms caption {
      font-weight: bold;
      padding: 6px;
      border: 1px solid #000;
      border-bottom: none;
      background: #f2f2f2;
    }
    table.terms th, table.terms td {
      border: 1px solid #000;
      padding: 7px 9px;
      vertical-align: top;
      text-align: left;
    }
    table.terms th { background: #f2f2f2; }
    table.terms td.head-col, table.terms th.head-col { width: 15%; font-weight: bold; }
    table.terms td.sno-col, table.terms th.sno-col { width: 6%; text-align: center; }

    h2.annexure-title {
      text-align: center;
      margin: 0 0 4px 0;
      font-size: 15px;
    }
    h3.annexure-sub {
      text-align: center;
      margin: 0 0 14px 0;
      font-size: 13px;
    }

    .special-notes-section {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
    }

    .special-notes {
      border: 1px solid #000;
      padding: 12px 16px;
      margin-top: 0;
      page-break-inside: avoid;
    }
    .special-notes p { margin: 6px 0; }
    .special-notes .lbl { font-weight: bold; }
    .special-notes a { color: #1155cc; text-decoration: underline; }
    .sig-space { height: 60px; }

    .ack-box {
      border: 1px solid #000;
      padding: 12px 16px;
      margin-top: 16px;
      page-break-inside: avoid;
    }
    .ack-box .sig-gap { height: 70px; }

    .po-body { margin-bottom: 16px; }

    tr { page-break-inside: avoid; }
  `;
}

function buildPoHtml({ title = "PURCHASE ORDER", bodyHtml = "", terms = [], annexureI = [], tokenData = {}, afterAnnexureHtml = "" }) {
  const renderedBody = renderTemplate(bodyHtml, tokenData, { missingTokenMode: "keep" });

  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${buildPoStyles()}</style>
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
