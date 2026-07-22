const { renderTemplate } = require("./templateRenderer");

function normalizeHtmlAssetUrls(html = "", baseUrl = "") {
  if (!html) return "";

  const cleanBase = String(baseUrl || "").replace(/\/+$/, "");

  return String(html)
    // Convert SCM relative image paths to absolute URLs.
    .replace(/src="\s*custom\//g, `src="${cleanBase}/custom/`)
    .replace(/src='\s*custom\//g, `src='${cleanBase}/custom/`)

    // Remove accidental whitespace after src quote.
    .replace(/src="\s+/g, 'src="')
    .replace(/src='\s+/g, "src='")

    // Convert legacy mPDF-style page tokens to Playwright page tokens.
    .replaceAll("{PAGENO}", '<span class="pageNumber"></span>')
    .replaceAll("{nb}", '<span class="totalPages"></span>');
}

function wrapPlaywrightTemplate(innerHtml = "", slot = "body") {
  const content = String(innerHtml || "").trim();
  if (!content) return "";

  if (content.includes("data-playwright-template")) {
    return content;
  }

  return `
    <div data-playwright-template="${slot}" style="
      width:100%;
      margin:0;
      padding:0 10mm;
      box-sizing:border-box;
      font-family:Arial,Helvetica,sans-serif;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
    ">
      <div style="width:100%; font-size:10px; line-height:1.35; color:#1a1a1a;">
        ${content}
      </div>
    </div>
  `;
}

function buildLetterheadTokens(row = {}, tokenData = {}) {
  return {
    ...tokenData,
    company_name: row.Company_Name || row.Untitled_Field || tokenData.buyer_company_name || "",
    letterhead_company_name: row.Company_Name || row.Untitled_Field || tokenData.buyer_company_name || "",
    company_code: row.Company_Code || tokenData.buyer_company_code || ""
  };
}

function buildDefaultRefexTextLogoHtml() {
  return `
    <div style="display:flex; justify-content:flex-end; width:100%; margin-bottom:4px;">
      <div style="font-size:24px; font-weight:800; font-style:italic; letter-spacing:-1px; line-height:1;">
        <span style="color:#2e3192;">r</span><span style="color:#27aae1;">e</span><span style="color:#39b54a;">f</span><span style="color:#8dc63f;">e</span><span style="color:#f7941d;">x</span>
      </div>
    </div>
  `;
}

function cleanUrl(value) {
  return String(value || "").trim();
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function buildHeaderHtmlFromLogoUrls(row = {}) {
  const leftUrl = cleanUrl(row.Header_Left_Logo_URL);
  const rightUrl = cleanUrl(row.Header_Right_Logo_URL);

  if (!leftUrl && !rightUrl) return "";

  const headerHeightMm = toFiniteNumber(row.Header_Height_mm, 18);
  const sharedLogoMaxHeightPx = toFiniteNumber(row.Header_Logo_Max_Height_px, 45);

  const leftLogoMaxHeightPx = toFiniteNumber(
    row.Header_Left_Logo_Max_Height_px,
    sharedLogoMaxHeightPx
  );

  const rightLogoMaxHeightPx = toFiniteNumber(
    row.Header_Right_Logo_Max_Height_px,
    sharedLogoMaxHeightPx
  );

  const leftLogo = leftUrl
    ? `<img src="${leftUrl}" style="max-height:${leftLogoMaxHeightPx}px; max-width:260px; object-fit:contain;" />`
    : "";

  const rightLogo = rightUrl
    ? `<img src="${rightUrl}" style="max-height:${rightLogoMaxHeightPx}px; max-width:260px; object-fit:contain;" />`
    : "";

  return wrapPlaywrightTemplate(`
    <div style="
      width:100%;
      height:${headerHeightMm}mm;
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:0;
      box-sizing:border-box;
      font-size:8px;
    ">
      <div style="text-align:left;">${leftLogo}</div>
      <div style="text-align:right;">${rightLogo || buildDefaultRefexTextLogoHtml()}</div>
    </div>
  `, "header");
}

async function embedRemoteImagesAsDataUris(html = "") {
  if (!html) return "";

  const imgSrcRegex = /<img\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;
  let output = String(html);
  const matches = [...String(html).matchAll(imgSrcRegex)];

  for (const match of matches) {
    const originalSrc = match[2];

    try {
      const response = await fetch(originalSrc);

      if (!response.ok) {
        continue;
      }

      const contentType = response.headers.get("content-type") || "image/png";
      const arrayBuffer = await response.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const dataUri = `data:${contentType};base64,${base64}`;

      output = output.replaceAll(originalSrc, dataUri);
    } catch (_error) {
      // Keep original src. Diagnostics will show header/footer applied but image may not render.
    }
  }

  return output;
}


function normalizeFooterSize(html = "") {
  if (!html) return "";

  let sizedHtml = String(html)
    .replaceAll("{PAGENO}", '<span class="pageNumber"></span>')
    .replaceAll("{nb}", '<span class="totalPages"></span>')
    .replace(
      /<p[^>]*>\s*<span class=["']pageNumber["']><\/span>\s*[-–]\s*<span class=["']totalPages["']><\/span>\s*<\/p>/gi,
      '<div style="text-align:center; font-size:11px; margin-top:8px;"><span class="pageNumber"></span>-<span class="totalPages"></span></div>'
    )

    // Update image style
    .replace(/<img\b([^>]*)>/gi, (_match, attrs) => {

      // Remove existing width/height/style
      let newAttrs = attrs
        .replace(/\swidth\s*=\s*["'][^"']*["']/gi, "")
        .replace(/\sheight\s*=\s*["'][^"']*["']/gi, "")
        .replace(/\sstyle\s*=\s*(["']).*?\1/gi, "");

      return `<img${newAttrs}
        style="
          display:block;
          margin:0 auto;
          width:700px;
          height:auto;
          max-width:700px;
          max-height:180px;
          object-fit:contain;
        ">`;
    });

  const hasPageNumber = /class=["']pageNumber["']|class=["']totalPages["']|\{PAGENO\}|\{nb\}/i.test(sizedHtml);
  const pageNumberHtml = hasPageNumber
    ? ""
    : `<div style="text-align:center; font-size:11px; margin-top:8px; width:100%;"><span class="pageNumber"></span>-<span class="totalPages"></span></div>`;

  return wrapPlaywrightTemplate(`
    <div style="width:100%; position:relative; font-size:8px; padding-top:5px; text-align:center;">
      ${sizedHtml}
      ${pageNumberHtml}
    </div>
  `, "footer");
}

function mapLetterhead(row = {}, baseUrl = "") {
  const configuredMarginTop = Number(row.Margin_Top_mm || 20);
  const marginBottom = Number(row.Margin_Bottom_mm || 25);
  const headerHeightMm = toFiniteNumber(row.Header_Height_mm, 18);

  // Prevent page body from colliding with Playwright header template.
  // Header_Height_mm is the primary admin-controlled setting.
  const safeMarginTop = Math.max(
    Number.isFinite(configuredMarginTop) ? configuredMarginTop : 20,
    headerHeightMm + 8
  );

  const generatedHeaderHtml = buildHeaderHtmlFromLogoUrls(row);
  const fallbackHeaderHtml = normalizeHtmlAssetUrls(row.Header_HTML || "", baseUrl);
  const rawHeaderHtml = generatedHeaderHtml || wrapPlaywrightTemplate(fallbackHeaderHtml || buildDefaultRefexTextLogoHtml(), "header");
  const normalizedFooterHtml = normalizeFooterSize(
    normalizeHtmlAssetUrls(row.Footer_HTML || "", baseUrl)
  );

  return {
    id: row._id || null,
    company_name: row.Company_Name || row.Untitled_Field || "",
    company_code: row.Company_Code || "",
    header_html: rawHeaderHtml,
    footer_html: normalizedFooterHtml,
    page_size: row.Page_Size || "A4",
    margin_top_mm: safeMarginTop,
    margin_bottom_mm: Number.isFinite(marginBottom) ? marginBottom : 25,
    header_height_mm: headerHeightMm,
    header_logo_max_height_px: toFiniteNumber(row.Header_Logo_Max_Height_px, 45),
    header_left_logo_url_set: Boolean(cleanUrl(row.Header_Left_Logo_URL)),
    header_right_logo_url_set: Boolean(cleanUrl(row.Header_Right_Logo_URL)),
    is_active: Boolean(row.Is_Active),
    version: row.Version || ""
  };
}

async function mapLetterheadForPdf(row = {}, baseUrl = "", tokenData = {}) {
  const mapped = mapLetterhead(row, baseUrl);
  const letterheadTokens = buildLetterheadTokens(row, tokenData);

  const headerWithTokens = renderTemplate(mapped.header_html, letterheadTokens, { missingTokenMode: "keep" });
  const footerWithTokens = renderTemplate(mapped.footer_html, letterheadTokens, { missingTokenMode: "keep" });

  return {
    ...mapped,
    header_html: await embedRemoteImagesAsDataUris(headerWithTokens),
    footer_html: await embedRemoteImagesAsDataUris(footerWithTokens)
  };
}

module.exports = {
  normalizeHtmlAssetUrls,
  normalizeFooterSize,
  wrapPlaywrightTemplate,
  buildLetterheadTokens,
  buildDefaultRefexTextLogoHtml,
  cleanUrl,
  buildHeaderHtmlFromLogoUrls,
  embedRemoteImagesAsDataUris,
  mapLetterhead,
  mapLetterheadForPdf
};
