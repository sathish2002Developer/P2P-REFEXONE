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

  const isFooter = slot === "footer";
  const horizontalPadding = isFooter ? "0" : "0 10mm";

  return `
    <div data-playwright-template="${slot}" style="
      width:100%;
      max-width:100%;
      margin:0;
      padding:${horizontalPadding};
      box-sizing:border-box;
      font-family:Arial,Helvetica,sans-serif;
      -webkit-print-color-adjust:exact;
      print-color-adjust:exact;
      overflow:hidden;
    ">
      <div style="
        width:100%;
        max-width:100%;
        margin:0 auto;
        text-align:${isFooter ? "center" : "left"};
        font-size:10px;
        line-height:1.35;
        color:#1a1a1a;
        box-sizing:border-box;
      ">
        ${content}
      </div>
    </div>
  `;
}

function sanitizeInlineStyle(style = "", { isFooter = false } = {}) {
  let next = String(style || "");

  if (isFooter) {
    next = next
      .replace(/position\s*:\s*(absolute|fixed)/gi, "position:relative")
      .replace(/float\s*:\s*(left|right)/gi, "float:none")
      .replace(/text-align\s*:\s*right/gi, "text-align:center")
      .replace(/margin-left\s*:\s*[^;]+;?/gi, "")
      .replace(/margin-right\s*:\s*[^;]+;?/gi, "")
      .replace(/\bleft\s*:\s*[^;]+;?/gi, "")
      .replace(/\bright\s*:\s*[^;]+;?/gi, "")
      .replace(/transform\s*:\s*[^;]+;?/gi, "");
  }

  next = next
    .replace(/width\s*:\s*(\d+(?:\.\d+)?)px/gi, (_match, px) => {
      return Number(px) > 620 ? "max-width:100%; width:auto" : `width:${px}px`;
    })
    .replace(/min-width\s*:\s*[^;]+;?/gi, "")
    .replace(/;;+/g, ";")
    .replace(/^\s*;\s*|\s*;\s*$/g, "")
    .trim();

  return next;
}

function normalizeFooterLayout(html = "") {
  let output = String(html || "");

  output = output.replace(/\sstyle=(["'])(.*?)\1/gi, (_match, quote, style) => {
    const sanitized = sanitizeInlineStyle(style, { isFooter: true });
    return sanitized ? ` style=${quote}${sanitized}${quote}` : "";
  });

  output = output.replace(/\salign=(["'])right\1/gi, ' align="center"');

  return `
    <div style="width:100%; max-width:100%; margin:0 auto; padding:0; text-align:center; box-sizing:border-box; overflow:hidden;">
      ${output}
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

function buildDefaultRefexFooterHtml() {
  return `
    <div style="text-align:center; width:100%; font-family:Arial,Helvetica,sans-serif; color:#333;">
      <div style="font-weight:bold; color:#2e3192; font-size:12px; line-height:1.3;">Refex Green Mobility Limited</div>
      <div style="font-size:9px; margin-bottom:4px;">(Wholly-Owned Subsidiary of Refex Industries Limited)</div>
      <div style="height:2px; max-width:620px; margin:4px auto; background:linear-gradient(90deg,#2e3192,#27aae1,#39b54a,#f7941d);"></div>
      <div style="display:inline-block; background:linear-gradient(90deg,#2e3192,#27aae1,#39b54a,#f7941d); color:#fff; padding:2px 12px; border-radius:12px; font-size:9px; font-weight:bold; margin:4px 0;">CIN:U74909TN2023PLC158849</div>
      <div style="font-size:8.5px; line-height:1.35; margin-top:3px;">
        <strong>Registered Office:</strong> 2<sup>nd</sup> Floor, No.313, Refex Towers, Sterling Road, Valluvar Kottam High Road, Nungambakkam, Chennai, Tamil Nadu 600 034<br>
        P: 044 - 3504 0050 | E: info@refex.co.in | W: www.refex.co.in
      </div>
      <div style="text-align:center; font-size:9px; margin-top:6px;">
        <span class="pageNumber"></span>-<span class="totalPages"></span>
      </div>
    </div>
  `;
}

function estimateFooterHeightMm(html = "") {
  const content = String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!content) return 0;

  let estimate = 42;
  const lineBreaks = (String(html).match(/<br\b|<\/p>|<\/div>/gi) || []).length;
  estimate += lineBreaks * 3.2;

  if (/<img\b/i.test(html)) {
    const heightMatch = String(html).match(/<img\b[^>]*\sheight=["']?(\d+)/i);
    const widthMatch = String(html).match(/<img\b[^>]*\swidth=["']?(\d+)/i);
    const imgHeightPx = heightMatch ? Number(heightMatch[1]) : 0;
    const imgWidthPx = widthMatch ? Number(widthMatch[1]) : 0;

    if (imgHeightPx > 0) {
      estimate = Math.max(estimate, Math.round(imgHeightPx * 0.28) + 8);
    } else if (imgWidthPx > 0) {
      estimate = Math.max(estimate, Math.round(imgWidthPx * 0.12) + 8);
    } else {
      estimate += 18;
    }
  }

  return Math.min(Math.max(estimate, 45), 68);
}

function estimateHeaderHeightMm(html = "", configuredHeightMm = 18) {
  const content = String(html || "").trim();
  if (!content) return configuredHeightMm;
  if (/<img\b/i.test(content)) {
    return Math.max(configuredHeightMm, 20);
  }
  return Math.max(configuredHeightMm, 16);
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


function normalizeFooterImages(html = "") {
  return String(html || "").replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
    if (/\sstyle\s*=/i.test(attrs)) {
      return `<img${attrs.replace(/\sstyle=(["'])(.*?)\1/i, (_styleMatch, quote, style) => {
        const sanitized = sanitizeInlineStyle(style, { isFooter: true });
        const merged = [sanitized, "display:block", "margin:0 auto", "max-width:100%", "height:auto"]
          .filter(Boolean)
          .join("; ")
          .replace(/;\s*;/g, ";");
        return ` style=${quote}${merged}${quote}`;
      })}>`;
    }

    return `<img${attrs} style="display:block; margin:0 auto; max-width:100%; height:auto;">`;
  });
}

function normalizeFooterSize(html = "") {
  if (!html) return "";

  let sizedHtml = normalizeFooterLayout(
    normalizeFooterImages(String(html))
  )
    .replaceAll("{PAGENO}", '<span class="pageNumber"></span>')
    .replaceAll("{nb}", '<span class="totalPages"></span>')
    .replace(
      /<p[^>]*>\s*<span class=["']pageNumber["']><\/span>\s*[-–]\s*<span class=["']totalPages["']><\/span>\s*<\/p>/gi,
      '<div style="text-align:center; font-size:11px; margin-top:8px; width:100%;"><span class="pageNumber"></span>-<span class="totalPages"></span></div>'
    );

  const hasPageNumber = /class=["']pageNumber["']|class=["']totalPages["']|\{PAGENO\}|\{nb\}/i.test(sizedHtml);
  const pageNumberHtml = hasPageNumber
    ? ""
    : `<div style="text-align:center; font-size:11px; margin-top:8px; width:100%;"><span class="pageNumber"></span>-<span class="totalPages"></span></div>`;

  return wrapPlaywrightTemplate(`
    <div style="width:100%; max-width:100%; margin:0 auto; padding-top:5px; text-align:center; box-sizing:border-box;">
      ${sizedHtml}
      ${pageNumberHtml}
    </div>
  `, "footer");
}

function mapLetterhead(row = {}, baseUrl = "") {
  const configuredMarginTop = Number(row.Margin_Top_mm || 20);
  const configuredMarginBottom = Number(row.Margin_Bottom_mm || 0);
  const configuredFooterHeight = Number(row.Footer_Height_mm || 0);
  const headerHeightMm = toFiniteNumber(row.Header_Height_mm, 18);

  const generatedHeaderHtml = buildHeaderHtmlFromLogoUrls(row);
  const fallbackHeaderHtml = normalizeHtmlAssetUrls(row.Header_HTML || "", baseUrl);
  const rawHeaderHtml = generatedHeaderHtml || wrapPlaywrightTemplate(fallbackHeaderHtml || buildDefaultRefexTextLogoHtml(), "header");

  const footerSourceHtml = normalizeHtmlAssetUrls(row.Footer_HTML || "", baseUrl) || buildDefaultRefexFooterHtml();
  const normalizedFooterHtml = normalizeFooterSize(footerSourceHtml);

  const estimatedFooterHeightMm = configuredFooterHeight > 0
    ? configuredFooterHeight
    : estimateFooterHeightMm(footerSourceHtml);

  const estimatedHeaderHeightMm = estimateHeaderHeightMm(rawHeaderHtml, headerHeightMm);

  const safeMarginTop = Math.max(
    Number.isFinite(configuredMarginTop) && configuredMarginTop > 0 ? configuredMarginTop : 22,
    estimatedHeaderHeightMm + 10
  );

  const safeMarginBottom = Math.max(
    Number.isFinite(configuredMarginBottom) && configuredMarginBottom > 0 ? configuredMarginBottom : 0,
    estimatedFooterHeightMm + 18,
    normalizedFooterHtml ? 52 : 18
  );

  return {
    id: row._id || null,
    company_name: row.Company_Name || row.Untitled_Field || "",
    company_code: row.Company_Code || "",
    header_html: rawHeaderHtml,
    footer_html: normalizedFooterHtml,
    page_size: row.Page_Size || "A4",
    margin_top_mm: safeMarginTop,
    margin_bottom_mm: safeMarginBottom,
    header_height_mm: estimatedHeaderHeightMm,
    footer_height_mm: estimatedFooterHeightMm,
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
  normalizeFooterLayout,
  sanitizeInlineStyle,
  wrapPlaywrightTemplate,
  buildLetterheadTokens,
  buildDefaultRefexTextLogoHtml,
  buildDefaultRefexFooterHtml,
  estimateFooterHeightMm,
  estimateHeaderHeightMm,
  cleanUrl,
  buildHeaderHtmlFromLogoUrls,
  embedRemoteImagesAsDataUris,
  mapLetterhead,
  mapLetterheadForPdf
};
