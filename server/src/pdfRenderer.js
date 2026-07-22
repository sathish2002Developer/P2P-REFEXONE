const { chromium } = require("playwright");
const { wrapPlaywrightTemplate } = require("./letterheadMapper");

function prepareTemplateHtml(html = "", slot = "body") {
  const content = String(html || "").trim();
  if (!content) return "<div></div>";
  if (content.includes("data-playwright-template")) return content;
  return wrapPlaywrightTemplate(content, slot);
}

async function renderHtmlToPdfBuffer({ html, headerHtml = "", footerHtml = "", marginTopMm = 20, marginBottomMm = 25 }) {
  if (!html || typeof html !== "string") {
    throw new Error("renderHtmlToPdfBuffer requires non-empty html");
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    const hasHeaderFooter = Boolean(String(headerHtml || "").trim() || String(footerHtml || "").trim());

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: hasHeaderFooter,
      headerTemplate: prepareTemplateHtml(headerHtml, "header"),
      footerTemplate: prepareTemplateHtml(footerHtml, "footer"),
      margin: {
        top: `${marginTopMm}mm`,
        right: "12mm",
        bottom: `${marginBottomMm}mm`,
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
