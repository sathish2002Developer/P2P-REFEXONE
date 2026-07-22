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

  return `
    <div style="
      width:100%;
      height:${headerHeightMm}mm;
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:0 12mm;
      box-sizing:border-box;
      font-size:8px;
    ">
      <div style="text-align:left;">${leftLogo}</div>
      <div style="text-align:right;">${rightLogo}</div>
    </div>
  `;
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
    // Remove old page number placeholders
    .replace(
      /<p[^>]*>\s*(\{PAGENO\}|\s*<span class=["']pageNumber["']><\/span>)\s*[-–]\s*(\{nb\}|\s*<span class=["']totalPages["']><\/span>)\s*<\/p>/gi,
      ""
    )
    .replace(/\{PAGENO\}\s*[-–]\s*\{nb\}/gi, "")

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

  return `
    <div style="
      width:100%;
      position:relative;
      font-size:8px;
      padding-top:5px;
      text-align:center;
    ">
      ${sizedHtml}

      <div style="
        position:absolute;
        right:10mm;
        bottom:0;
        font-size:9px;
        color:#000;
        white-space:nowrap;
      ">
        Page <span class="pageNumber"></span> /
        <span class="totalPages"></span>
      </div>
    </div>
  `;
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
  const normalizedFooterHtml = normalizeFooterSize(
    normalizeHtmlAssetUrls(row.Footer_HTML || "", baseUrl)
  );

  return {
    id: row._id || null,
    company_name: row.Untitled_Field || row.Company_Name || "",
    company_code: row.Company_Code || "",
    header_html: generatedHeaderHtml || fallbackHeaderHtml,
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

async function mapLetterheadForPdf(row = {}, baseUrl = "") {
  const mapped = mapLetterhead(row, baseUrl);

  return {
    ...mapped,
    header_html: await embedRemoteImagesAsDataUris(mapped.header_html),
    footer_html: await embedRemoteImagesAsDataUris(mapped.footer_html)
  };
}

module.exports = {
  normalizeHtmlAssetUrls,
  normalizeFooterSize,
  cleanUrl,
  buildHeaderHtmlFromLogoUrls,
  embedRemoteImagesAsDataUris,
  mapLetterhead,
  mapLetterheadForPdf
};
