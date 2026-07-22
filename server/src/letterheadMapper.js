const { getConfig } = require("./config");
const { renderTemplate } = require("./templateRenderer");
const { kissflowFetch, isCloudflareChallenge } = require("./kissflowClient");
const {
  isKissflowHostUrl,
  resolveLetterheadLogoSources
} = require("./kissflowImageFetch");

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
  const horizontalPadding = isFooter ? "0" : "0 8mm";
  const overflowStyle = isFooter ? "visible" : "hidden";

  return `
    <div data-playwright-template="${slot}" style="width:100%; margin:0; padding:${horizontalPadding}; box-sizing:border-box; font-size:10px; line-height:1.2; font-family:Arial,Helvetica,sans-serif; color:#1a1a1a; overflow:${overflowStyle}; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
      ${content}
    </div>
  `;
}

function stripNonTemplateMarkup(html = "") {
  return String(html || "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<\/?(?:html|head|body|meta|link|title)\b[^>]*>/gi, "")
    .trim();
}

function hasVisibleHtmlText(html = "") {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length > 0;
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
    const merged = [sanitized, "font-size:9px", "color:#333"].filter(Boolean).join("; ");
    return ` style=${quote}${merged}${quote}`;
  });

  output = output.replace(/\salign=(["'])right\1/gi, ' align="center"');

  return output;
}

function resolveFooterLogoMaxHeightPx(row = {}) {
  return toFiniteNumber(row.Footer_Logo_Max_Height_px || row.Header_Logo_Max_Height_px, 42);
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
    <div style="text-align:center; width:100%; font-family:Arial,Helvetica,sans-serif; color:#333; font-size:9px;">
      <div style="font-weight:bold; color:#2e3192; font-size:12px; line-height:1.3;">Refex Green Mobility Limited</div>
      <div style="font-size:9px; margin-bottom:4px;">(Wholly-Owned Subsidiary of Refex Industries Limited)</div>
      <div style="height:2px; max-width:620px; margin:4px auto; background:#2e3192;"></div>
      <div style="font-size:9px; font-weight:bold; margin:4px 0; color:#2e3192;">CIN:U74909TN2023PLC158849</div>
      <div style="font-size:8.5px; line-height:1.35; margin-top:3px; color:#333;">
        <strong>Registered Office:</strong> 2<sup>nd</sup> Floor, No.313, Refex Towers, Sterling Road, Valluvar Kottam High Road, Nungambakkam, Chennai, Tamil Nadu 600 034<br>
        P: 044 - 3504 0050 | E: info@refex.co.in | W: www.refex.co.in
      </div>
      <div style="text-align:center; font-size:9px; margin-top:6px; color:#333;">
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

function estimateHeaderHeightMm(html = "", configuredHeightMm = 18, maxLogoHeightPx = 50) {
  const content = String(html || "").trim();
  const logoHeightMm = pxToMm(maxLogoHeightPx);

  let estimate = Math.max(
    configuredHeightMm,
    logoHeightMm + 4,
    /<img\b/i.test(content) ? logoHeightMm + 6 : 0
  );

  if (!content) {
    return Math.max(configuredHeightMm, logoHeightMm + 4);
  }

  const heightMatch = content.match(/<img\b[^>]*\sheight=["']?(\d+)/i);
  const styleHeightMatch = content.match(/max-height\s*:\s*(\d+(?:\.\d+)?)px/i);

  if (heightMatch) {
    estimate = Math.max(estimate, pxToMm(Number(heightMatch[1])) + 6);
  } else if (styleHeightMatch) {
    estimate = Math.max(estimate, pxToMm(Number(styleHeightMatch[1])) + 6);
  }

  return Math.max(estimate, 16);
}

function resolveHeaderLogoMaxHeightPx(row = {}) {
  return toFiniteNumber(row.Header_Logo_Max_Height_px, 50);
}

function pxToMm(px) {
  return Math.round(Number(px) * 0.264583 * 10) / 10;
}

function mergeImgStyle(existingStyle = "", rules = []) {
  let style = String(existingStyle || "")
    .replace(/max-height\s*:\s*[^;]+;?/gi, "")
    .replace(/max-width\s*:\s*[^;]+;?/gi, "")
    .replace(/width\s*:\s*[^;]+;?/gi, "")
    .replace(/height\s*:\s*[^;]+;?/gi, "")
    .replace(/display\s*:\s*[^;]+;?/gi, "")
    .replace(/;;+/g, ";")
    .trim();

  const merged = [...rules, style].filter(Boolean).join("; ").replace(/;\s*;/g, ";");
  return merged.endsWith(";") ? merged : `${merged};`;
}

function normalizeHeaderImages(html = "", maxHeightPx = 50) {
  return String(html || "").replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
    let nextAttrs = String(attrs || "")
      .replace(/\sheight=(["'])[^"']*\1/gi, "")
      .replace(/\sheight=\S+/gi, "")
      .replace(/\swidth=(["'])[^"']*\1/gi, "")
      .replace(/\swidth=\S+/gi, "");

    const imgStyle = mergeImgStyle(
      (nextAttrs.match(/\sstyle=(["'])(.*?)\1/i) || [])[2] || "",
      [
        "display:block",
        `max-height:${maxHeightPx}px`,
        "max-width:220px",
        "width:auto",
        "height:auto"
      ]
    );

    nextAttrs = nextAttrs.replace(/\sstyle=(["'])(.*?)\1/gi, "");
    return `<img${nextAttrs} style="${imgStyle}">`;
  });
}

function normalizeHeaderHtml(html = "", maxHeightPx = 50) {
  return normalizeHeaderImages(String(html || "").trim(), maxHeightPx);
}

function buildHeaderLogoImg(url, { align = "left", maxHeightPx = 50, maxWidthPx = 220 } = {}) {
  if (!url) return "";

  const alignStyle = align === "right" ? "margin-left:auto;" : "";
  return `<img src="${url}" alt="" style="display:block; ${alignStyle} max-height:${maxHeightPx}px; max-width:${maxWidthPx}px; width:auto; height:auto;" />`;
}
function buildDefaultRefexTextLogoHtml() {
  return `
    <div style="text-align:right; width:100%; font-size:18px; font-weight:800; font-style:italic; letter-spacing:-1px; line-height:1.1;">
      <span style="color:#2e3192;">r</span><span style="color:#27aae1;">e</span><span style="color:#39b54a;">f</span><span style="color:#8dc63f;">e</span><span style="color:#f7941d;">x</span>
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

function buildHeaderHtmlFromLogoUrls(row = {}, logoSources = {}, maxLogoHeightPx = 50) {
  const leftUrl = cleanUrl(logoSources.left || row.Header_Left_Logo_URL);
  const rightUrl = cleanUrl(logoSources.right || row.Header_Right_Logo_URL);

  if (!leftUrl && !rightUrl) return "";

  const leftLogo = buildHeaderLogoImg(leftUrl, { align: "left", maxHeightPx: maxLogoHeightPx, maxWidthPx: 240 });
  const rightLogo = buildHeaderLogoImg(rightUrl, { align: "right", maxHeightPx: maxLogoHeightPx, maxWidthPx: 180 });

  return wrapPlaywrightTemplate(`
    <table style="width:100%; border-collapse:collapse; table-layout:fixed; font-size:10px;">
      <tr>
        <td style="width:58%; text-align:left; vertical-align:middle; padding:0; overflow:hidden;">${leftLogo}</td>
        <td style="width:42%; text-align:right; vertical-align:middle; padding:0; overflow:hidden;">${rightLogo || buildDefaultRefexTextLogoHtml()}</td>
      </tr>
    </table>
  `, "header");
}

async function embedRemoteImagesAsDataUris(html = "", _options = {}) {
  if (!html) return html;

  const imgSrcRegex = /<img\b[^>]*\bsrc=(["'])(https?:\/\/[^"']+)\1[^>]*>/gi;
  let output = String(html);
  const matches = [...String(html).matchAll(imgSrcRegex)];

  for (const match of matches) {
    const originalSrc = match[2];
    const kissflowUrl = isKissflowHostUrl(originalSrc);

    try {
      const result = await kissflowFetch(originalSrc, {
        method: "GET",
        responseType: "buffer",
        headers: kissflowUrl
          ? { Accept: "image/*, */*" }
          : {}
      }, {
        maxRetries: kissflowUrl ? 1 : 0
      });

      if (result.status === 429) {
        break;
      }

      if (!result.ok) {
        const bodyPreview = Buffer.isBuffer(result.body)
          ? result.body.toString("utf8", 0, 200)
          : String(result.body || "");

        if (isCloudflareChallenge(bodyPreview)) {
          break;
        }

        continue;
      }

      const contentType = result.headers.get("content-type") || "image/png";
      const base64 = Buffer.from(result.body).toString("base64");
      const dataUri = `data:${contentType};base64,${base64}`;

      output = output.replaceAll(originalSrc, dataUri);
    } catch (_error) {
      // Keep original src. Diagnostics will show header/footer applied but image may not render.
    }
  }

  return output;
}


function normalizeFooterImages(html = "", maxHeightPx = 42) {
  return String(html || "").replace(/<img\b([^>]*)>/gi, (_match, attrs) => {
    let nextAttrs = String(attrs || "")
      .replace(/\sheight=(["'])[^"']*\1/gi, "")
      .replace(/\sheight=\S+/gi, "")
      .replace(/\swidth=(["'])[^"']*\1/gi, "")
      .replace(/\swidth=\S+/gi, "");

    const imgStyle = mergeImgStyle(
      (nextAttrs.match(/\sstyle=(["'])(.*?)\1/i) || [])[2] || "",
      [
        "display:block",
        "margin:0 auto",
        `max-height:${maxHeightPx}px`,
        "max-width:100%",
        "width:auto",
        "height:auto"
      ]
    );

    nextAttrs = nextAttrs.replace(/\sstyle=(["'])(.*?)\1/gi, "");
    return `<img${nextAttrs} style="${imgStyle}">`;
  });
}

function normalizeFooterSize(html = "", maxFooterImageHeightPx = 42) {
  const sourceHtml = stripNonTemplateMarkup(String(html || "").trim());

  if (!sourceHtml) {
    return normalizeFooterSize(buildDefaultRefexFooterHtml(), maxFooterImageHeightPx);
  }

  let sizedHtml = normalizeFooterLayout(
    normalizeFooterImages(sourceHtml, maxFooterImageHeightPx)
  )
    .replaceAll("{PAGENO}", '<span class="pageNumber"></span>')
    .replaceAll("{nb}", '<span class="totalPages"></span>')
    .replace(
      /<p[^>]*>\s*<span class=["']pageNumber["']><\/span>\s*[-–]\s*<span class=["']totalPages["']><\/span>\s*<\/p>/gi,
      '<div style="text-align:center; font-size:9px; margin-top:6px; width:100%; color:#333;"><span class="pageNumber"></span>-<span class="totalPages"></span></div>'
    );

  const hasPageNumber = /class=["']pageNumber["']|class=["']totalPages["']|\{PAGENO\}|\{nb\}/i.test(sizedHtml);
  const pageNumberHtml = hasPageNumber
    ? ""
    : `<div style="text-align:center; font-size:9px; margin-top:6px; width:100%; color:#333;"><span class="pageNumber"></span>-<span class="totalPages"></span></div>`;

  return wrapPlaywrightTemplate(`
    <div style="width:100%; margin:0 auto; padding:0; text-align:center; box-sizing:border-box; font-size:9px; line-height:1.3; color:#333;">
      ${sizedHtml}
      ${pageNumberHtml}
    </div>
  `, "footer");
}

function ensureFooterTemplate(html = "", maxFooterImageHeightPx = 42) {
  const content = String(html || "").trim();

  if (content.includes("data-playwright-template")) {
    const hasEmbeddedImage = /<img\b[^>]*\bsrc=(["'])data:/i.test(content);
    const hasRemoteImage = /<img\b[^>]*\bsrc=(["'])https?:\/\//i.test(content);

    if (hasVisibleHtmlText(content) || hasEmbeddedImage) {
      return content;
    }

    if (hasRemoteImage) {
      return normalizeFooterSize(buildDefaultRefexFooterHtml(), maxFooterImageHeightPx);
    }

    return normalizeFooterSize(buildDefaultRefexFooterHtml(), maxFooterImageHeightPx);
  }

  if (!content || (!hasVisibleHtmlText(content) && !/<img\b/i.test(content))) {
    return normalizeFooterSize(buildDefaultRefexFooterHtml(), maxFooterImageHeightPx);
  }

  return normalizeFooterSize(content, maxFooterImageHeightPx);
}

function mapLetterhead(row = {}, baseUrl = "", logoSources = {}) {
  const configuredMarginTop = Number(row.Margin_Top_mm || 20);
  const configuredMarginBottom = Number(row.Margin_Bottom_mm || 0);
  const configuredFooterHeight = Number(row.Footer_Height_mm || 0);
  const headerHeightMm = toFiniteNumber(row.Header_Height_mm, 18);
  const maxLogoHeightPx = resolveHeaderLogoMaxHeightPx(row);
  const maxFooterImageHeightPx = resolveFooterLogoMaxHeightPx(row);

  const generatedHeaderHtml = buildHeaderHtmlFromLogoUrls(row, logoSources, maxLogoHeightPx);
  const fallbackHeaderHtml = normalizeHeaderHtml(
    normalizeHtmlAssetUrls(row.Header_HTML || "", baseUrl),
    maxLogoHeightPx
  );
  const rawHeaderHtml = generatedHeaderHtml || wrapPlaywrightTemplate(fallbackHeaderHtml || buildDefaultRefexTextLogoHtml(), "header");

  const footerSourceHtml = stripNonTemplateMarkup(
    normalizeHtmlAssetUrls(row.Footer_HTML || "", baseUrl)
  );
  const footerBaseHtml = (hasVisibleHtmlText(footerSourceHtml) || /<img\b/i.test(footerSourceHtml))
    ? footerSourceHtml
    : buildDefaultRefexFooterHtml();
  const normalizedFooterHtml = ensureFooterTemplate(footerBaseHtml, maxFooterImageHeightPx);

  const estimatedFooterHeightMm = configuredFooterHeight > 0
    ? configuredFooterHeight
    : estimateFooterHeightMm(footerBaseHtml);

  const estimatedHeaderHeightMm = estimateHeaderHeightMm(rawHeaderHtml, headerHeightMm, maxLogoHeightPx);

  const safeMarginTop = Math.max(
    Number.isFinite(configuredMarginTop) && configuredMarginTop > 0 ? configuredMarginTop : 22,
    estimatedHeaderHeightMm + 14,
    pxToMm(maxLogoHeightPx) + 16
  );

  const safeMarginBottom = Math.max(
    Number.isFinite(configuredMarginBottom) && configuredMarginBottom > 0 ? configuredMarginBottom : 0,
    estimatedFooterHeightMm + 20,
    normalizedFooterHtml ? 55 : 20
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
    header_logo_max_height_px: maxLogoHeightPx,
    header_left_logo_url_set: Boolean(cleanUrl(logoSources.left || row.Header_Left_Logo_URL)),
    header_right_logo_url_set: Boolean(cleanUrl(logoSources.right || row.Header_Right_Logo_URL)),
    header_left_logo_source: logoSources.left_source || (cleanUrl(row.Header_Left_Logo_URL) ? "url_field" : "none"),
    header_right_logo_source: logoSources.right_source || (cleanUrl(row.Header_Right_Logo_URL) ? "url_field" : "none"),
    header_logo_file_left_set: Boolean(row.Logo_File?.id || row.Logo_File?.key),
    header_logo_file_right_set: Boolean(row.Logo_File_Right?.id || row.Logo_File_Right?.key),
    is_active: Boolean(row.Is_Active),
    version: row.Version || ""
  };
}

async function mapLetterheadForPdf(row = {}, baseUrl = "", tokenData = {}) {
  const config = getConfig();
  const logoSources = await resolveLetterheadLogoSources(row, {
    baseUrl,
    dataformId: config.kissflowModels.companyLetterheadDataformId,
    instanceId: row._id || ""
  });

  const mapped = mapLetterhead(row, baseUrl, logoSources);
  const letterheadTokens = buildLetterheadTokens(row, tokenData);
  const maxFooterImageHeightPx = resolveFooterLogoMaxHeightPx(row);
  const headerWithTokens = renderTemplate(mapped.header_html, letterheadTokens, { missingTokenMode: "keep" });
  const footerWithTokens = renderTemplate(mapped.footer_html, letterheadTokens, { missingTokenMode: "keep" });
  const footerWithEmbeddedImages = await embedRemoteImagesAsDataUris(footerWithTokens);

  return {
    ...mapped,
    header_html: await embedRemoteImagesAsDataUris(headerWithTokens),
    footer_html: ensureFooterTemplate(footerWithEmbeddedImages, maxFooterImageHeightPx)
  };
}

module.exports = {
  normalizeHtmlAssetUrls,
  normalizeFooterSize,
  normalizeFooterLayout,
  stripNonTemplateMarkup,
  hasVisibleHtmlText,
  resolveFooterLogoMaxHeightPx,
  ensureFooterTemplate,
  normalizeHeaderHtml,
  normalizeHeaderImages,
  sanitizeInlineStyle,
  wrapPlaywrightTemplate,
  buildLetterheadTokens,
  buildDefaultRefexTextLogoHtml,
  buildDefaultRefexFooterHtml,
  buildHeaderLogoImg,
  estimateFooterHeightMm,
  estimateHeaderHeightMm,
  resolveHeaderLogoMaxHeightPx,
  pxToMm,
  mergeImgStyle,
  embedRemoteImagesAsDataUris,
  mapLetterhead,
  mapLetterheadForPdf
};
