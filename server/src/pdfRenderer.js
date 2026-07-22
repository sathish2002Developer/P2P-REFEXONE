const { chromium } = require("playwright");
const { wrapPlaywrightTemplate, ensureFooterTemplate } = require("./letterheadMapper");

function prepareTemplateHtml(html = "", slot = "body") {
  const content = String(html || "").trim();
  if (!content) {
    return '<div style="font-size:10px; width:100%; margin:0; padding:0; color:#000;"></div>';
  }

  if (content.includes("data-playwright-template")) {
    return content;
  }

  return wrapPlaywrightTemplate(content, slot);
}

async function renderHtmlToPdfBuffer({
  html,
  headerHtml = "",
  footerHtml = "",
  marginTopMm = 20,
  marginBottomMm = 25,
  headerHeightMm = 0,
  footerHeightMm = 0
}) {
  if (!html || typeof html !== "string") {
    throw new Error("renderHtmlToPdfBuffer requires non-empty html");
  }

  const resolvedFooterHtml = ensureFooterTemplate(footerHtml);
  const hasFooter = Boolean(String(resolvedFooterHtml || "").trim());
  const hasHeader = Boolean(String(headerHtml || "").trim());
  const hasHeaderFooter = hasHeader || hasFooter;

  const estimatedFooterReserve = footerHeightMm > 0 ? footerHeightMm + 20 : 0;
  const estimatedHeaderReserve = headerHeightMm > 0 ? headerHeightMm + 14 : 0;
  const safeMarginTop = Math.max(
    Number(marginTopMm) || 20,
    estimatedHeaderReserve,
    hasHeader ? 30 : 15
  );
  const safeMarginBottom = Math.max(
    Number(marginBottomMm) || 25,
    estimatedFooterReserve,
    hasFooter ? 55 : 20
  );

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: hasHeaderFooter,
      headerTemplate: prepareTemplateHtml(headerHtml, "header"),
      footerTemplate: prepareTemplateHtml(resolvedFooterHtml, "footer"),
      margin: {
        top: `${safeMarginTop}mm`,
        right: "12mm",
        bottom: `${safeMarginBottom}mm`,
        left: "12mm"
      }
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

module.exports = {
  renderHtmlToPdfBuffer
};
