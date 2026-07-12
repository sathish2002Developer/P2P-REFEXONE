const { chromium } = require("playwright");

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

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: Boolean(headerHtml || footerHtml),
      headerTemplate: headerHtml || "<div></div>",
      footerTemplate: footerHtml || "<div></div>",
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
