const express = require("express");
const { getConfig } = require("./src/config");
const { buildPoHtml } = require("./src/poHtmlBuilder");
const { renderHtmlToPdfBuffer } = require("./src/pdfRenderer");
const { uploadPdfBuffer } = require("./src/gcs");
const { resolveActivityInstanceId, resolveAttachmentCredentials, attachPdfToProcessField } = require("./src/kissflowAttachments");
const { getAccountProbe, kfRequest } = require("./src/kissflowClient");
const { probeMasterDataforms, getDataformItem, findCompanyLetterhead, findCompanyLetterheadByCode, findAnnexureMasterByPoType } = require("./src/kissflowDataforms");
const { mapAnnexureMaster } = require("./src/annexureMapper");
const { getPurchaseOrderInstance, updatePurchaseOrderInstance } = require("./src/kissflowProcesses");
const { buildPurchaseOrderBodyHtml, mapProcessTermsRows, mapProcessAnnexureRows, mapAllAnnexureImageRows } = require("./src/poMapper");
const { mapLetterhead, mapLetterheadForPdf } = require("./src/letterheadMapper");
const { resolveAnnexure1ImageRows, parseProcessAttachmentKey } = require("./src/kissflowImageFetch");

function formatRunTimestampForFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");

  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const ss = pad(date.getSeconds());

  return `${yyyy}-${mm}-${dd}_${hh}-${mi}-${ss}`;
}

const config = getConfig();

const app = express();
const port = config.service.port;

app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  const requestedHeaders =
    req.headers["access-control-request-headers"] ||
    "Content-Type, Authorization, X-Requested-With, Accept, Origin";

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin, Access-Control-Request-Headers");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", requestedHeaders);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Max-Age", "3600");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  next();
});

app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: config.service.name,
    version: config.service.version,
    app_env: config.service.appEnv
  });
});

app.get("/config-check", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: config.service.name,
    app_env: config.service.appEnv,
    gcp: {
      project_id: config.gcp.projectId,
      region: config.gcp.region,
      bucket_name: config.gcp.bucketName
    },
    kissflow: {
      base_url: config.kissflow.baseUrl,
      account_id_set: Boolean(config.kissflow.accountId),
      access_key_id_set: Boolean(config.kissflow.accessKeyId),
      access_key_secret_set: Boolean(config.kissflow.accessKeySecret)
    },
    pdf: {
      signed_url_ttl_minutes: config.pdf.signedUrlTtlMinutes
    },
    kissflow_models: {
      company_letterhead_dataform_id: config.kissflowModels.companyLetterheadDataformId,
      po_annexure_master_dataform_id: config.kissflowModels.poAnnexureMasterDataformId,
      purchase_order_process_id: config.kissflowModels.purchaseOrderProcessId,
      purchase_order_line_items_table_id: config.kissflowModels.purchaseOrderLineItemsTableId
    }
  });
});

app.get("/kissflow/config-probe", async (_req, res) => {
  try {
    const probe = await getAccountProbe();

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      kissflow: {
        base_url: probe.base_url,
        account_id_set: Boolean(probe.account_id),
        access_key_id_set: probe.access_key_id_set,
        access_key_secret_set: probe.access_key_secret_set
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.get("/kissflow/auth-probe", async (_req, res) => {
  try {
    const result = await kfRequest(`/account/2/${config.kissflow.accountId}/user/me`, {
      method: "GET"
    });

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      status: result.status,
      data_type: Array.isArray(result.data) ? "array" : typeof result.data,
      has_data: Boolean(result.data)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.get("/kissflow/master-data-probe", async (_req, res) => {
  try {
    const result = await probeMasterDataforms();

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      letterheads: {
        status: result.letterheads.status,
        data_type: Array.isArray(result.letterheads.data) ? "array" : typeof result.letterheads.data,
        sample: Array.isArray(result.letterheads.data) ? result.letterheads.data.slice(0, 1) : result.letterheads.data
      },
      annexures: {
        status: result.annexures.status,
        data_type: Array.isArray(result.annexures.data) ? "array" : typeof result.annexures.data,
        sample: Array.isArray(result.annexures.data) ? result.annexures.data.slice(0, 1) : result.annexures.data
      }
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.get("/kissflow/letterhead/:companyCode", async (req, res) => {
  try {
    const result = await findCompanyLetterheadByCode(req.params.companyCode);

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      status: result.status,
      company_code: result.companyCode,
      found: result.found,
      total_count: result.totalCount,
      row: result.row
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.get("/kissflow/letterhead/:companyCode/mapped", async (req, res) => {
  try {
    const result = await findCompanyLetterhead({
      companyCode: req.params.companyCode,
      companyName: req.query.company_name || ""
    });
    const mapped = await mapLetterheadForPdf(
      result.row || {},
      config.kissflow.baseUrl
    );

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      status: result.status,
      company_code: result.companyCode,
      company_name: result.companyName || "",
      found: result.found,
      matched_by: result.matched_by || "none",
      mapped
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.get("/kissflow/annexure-master/:itemId", async (req, res) => {
  try {
    const result = await getDataformItem(
      config.kissflowModels.poAnnexureMasterDataformId,
      req.params.itemId
    );

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      status: result.status,
      data_type: Array.isArray(result.data) ? "array" : typeof result.data,
      data: result.data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.get("/kissflow/annexure-master/:itemId/mapped", async (req, res) => {
  try {
    const result = await getDataformItem(
      config.kissflowModels.poAnnexureMasterDataformId,
      req.params.itemId
    );

    const mapped = mapAnnexureMaster(result.data);

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      status: result.status,
      mapped
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.get("/kissflow/purchase-order/:instanceId", async (req, res) => {
  try {
    const result = await getPurchaseOrderInstance(req.params.instanceId);

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      status: result.status,
      data_type: Array.isArray(result.data) ? "array" : typeof result.data,
      data: result.data
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.post("/generate-po-pdf", async (req, res) => {
  try {
    const {
      title = "WORK ORDER",
      instance_id = "local-test-instance",
      body_html,
      terms = [],
      annexure_i = [],
      token_data = {},
      header_html = "",
      footer_html = "",
      margin_top_mm = 15,
      margin_bottom_mm = 18,
      attach_to_kissflow = false,
      attachment_field_id = "Purchase_Order_Pdf"
    } = req.body || {};

    const html = buildPoHtml({
      title,
      bodyHtml: body_html || "<p><strong>Missing body_html</strong></p>",
      terms,
      annexureI: annexure_i,
      tokenData: token_data
    });

    const pdfBuffer = await renderHtmlToPdfBuffer({
      html,
      headerHtml: header_html,
      footerHtml: footer_html,
      marginTopMm: margin_top_mm,
      marginBottomMm: margin_bottom_mm
    });

    const objectName = `generated/${config.service.appEnv}/${instance_id}/${Date.now()}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;

    const uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      objectName,
      metadata: {
        source: "generate-po-pdf",
        app_env: config.service.appEnv,
        instance_id
      }
    });

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      instance_id,
      gcs_object_field_updated: gcsObjectFieldUpdated,
      bytes: pdfBuffer.length,
      gcs_uri: uploaded.gcsUri,
      gcs_object_name: uploaded.objectName,
      signed_url_created: Boolean(uploaded.signedUrl),
      signed_url: uploaded.signedUrl,
      kissflow_attachment: kissflowAttachment
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

app.post("/generate-po-pdf/from-master", async (req, res) => {
  try {
    const {
      title,
      instance_id,
      annexure_master_id,
      po_type,
      body_html,
      token_data = {},
      header_html = "",
      footer_html = "",
      margin_top_mm = 15,
      margin_bottom_mm = 18,
      attach_to_kissflow = false,
      attachment_field_id = "Purchase_Order_Pdf"
    } = req.body || {};

    if (!instance_id) {
      return res.status(400).json({
        ok: false,
        error: "instance_id is required"
      });
    }

    if (!annexure_master_id && !po_type) {
      return res.status(400).json({
        ok: false,
        error: "Either annexure_master_id or po_type is required"
      });
    }

    const poResult = await getPurchaseOrderInstance(instance_id);

    let masterResult;
    let resolvedAnnexureMasterId = annexure_master_id || "";
    let resolvedPoType = po_type || "";

    if (resolvedAnnexureMasterId) {
      masterResult = await getDataformItem(
        config.kissflowModels.poAnnexureMasterDataformId,
        resolvedAnnexureMasterId
      );
    } else {
      const lookupResult = await findAnnexureMasterByPoType(resolvedPoType);

      if (!lookupResult.found || !lookupResult.row?._id) {
        throw new Error(`No active annexure master found for PO_Type: ${resolvedPoType}`);
      }

      resolvedAnnexureMasterId = lookupResult.row._id;

      masterResult = await getDataformItem(
        config.kissflowModels.poAnnexureMasterDataformId,
        resolvedAnnexureMasterId
      );
    }

    const mappedMaster = mapAnnexureMaster(masterResult.data);

    const mappedPo = buildPurchaseOrderBodyHtml(poResult.data, {
      lineItemsTableId: config.kissflowModels.purchaseOrderLineItemsTableId
    });

    const mergedTokenData = {
      ...mappedPo.tokenData,
      ...token_data
    };

    const letterheadResult = await findCompanyLetterhead({
      companyCode: mappedPo.tokenData.buyer_company_code,
      companyName: mappedPo.tokenData.buyer_company_name
    });

    const mappedLetterhead = await mapLetterheadForPdf(
      letterheadResult.row || {},
      config.kissflow.baseUrl,
      mergedTokenData
    );

    const processTerms = mapProcessTermsRows(
      poResult.data,
      1
    );

    const processAnnexureI = mapProcessAnnexureRows(
      poResult.data,
      1
    );

    const processAnnexure1Rows = mapAllAnnexureImageRows(poResult.data);

    let annexureActivityInstanceId = "";

    try {
      annexureActivityInstanceId = resolveActivityInstanceId(poResult.data);
    } catch (_error) {
      const parsedKey = parseProcessAttachmentKey(poResult.data?.Po_image?.key || "");
      annexureActivityInstanceId = parsedKey?.activityInstanceId || "";
    }

    let annexureImageCredentials = {};

    try {
      const resolvedCredentials = resolveAttachmentCredentials(config, poResult.data);
      annexureImageCredentials = {
        accessKeyId: resolvedCredentials.accessKeyId,
        accessKeySecret: resolvedCredentials.accessKeySecret
      };
    } catch (_error) {
      annexureImageCredentials = {};
    }

    const resolvedAnnexure1Rows = await resolveAnnexure1ImageRows(processAnnexure1Rows, {
      baseUrl: config.kissflow.baseUrl,
      processId: config.kissflowModels.purchaseOrderProcessId,
      instanceId: instance_id,
      activityInstanceId: annexureActivityInstanceId,
      credentials: annexureImageCredentials
    });

    // New source-of-truth rule:
    // Populate Terms & Annexure copies master rows into the PO child tables.
    // Generate PO must use the edited PO child-table rows only, not append master rows again.
    const finalTerms = processTerms;
    const finalAnnexureI = processAnnexureI;
    const finalAnnexure1Rows = resolvedAnnexure1Rows;
    const annexure1ImageCount = finalAnnexure1Rows.filter((row) => row.row_type === "image").length;
    const annexure1ImagesLoaded = finalAnnexure1Rows.filter((row) => row.row_type === "image" && row.image_loaded).length;

    if (!finalTerms.length && !finalAnnexureI.length && !annexure1ImageCount) {
      throw new Error(
        "Terms, Annexure, and Annexure-1 images are empty. Please click Populate Terms & Annexure first, review the rows, then generate the PO."
      );
    }

    const html = buildPoHtml({
      title: title || mappedPo.title,
      bodyHtml: body_html || mappedPo.bodyHtml,
      terms: finalTerms,
      annexureI: finalAnnexureI,
      annexure1Rows: finalAnnexure1Rows,
      tokenData: mergedTokenData,
      afterAnnexureHtml: mappedPo.specialNotesHtml || "",
      footerReserveMm: mappedLetterhead?.margin_bottom_mm || margin_bottom_mm || 52
    });

    const pdfBuffer = await renderHtmlToPdfBuffer({
      html,
      headerHtml: mappedLetterhead?.header_html || header_html,
      footerHtml: mappedLetterhead?.footer_html || footer_html,
      marginTopMm: mappedLetterhead?.margin_top_mm || margin_top_mm,
      marginBottomMm: mappedLetterhead?.margin_bottom_mm || margin_bottom_mm,
      headerHeightMm: mappedLetterhead?.header_height_mm || 0,
      footerHeightMm: mappedLetterhead?.footer_height_mm || 0
    });

    const finalTitle = title || mappedPo.title;
    const safeTitle = finalTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const objectName = `generated/${config.service.appEnv}/${instance_id}/${Date.now()}-${safeTitle}-from-po-master.pdf`;

    const uploaded = await uploadPdfBuffer({
      buffer: pdfBuffer,
      objectName,
      metadata: {
        source: "generate-po-pdf-from-master",
        app_env: config.service.appEnv,
        instance_id,
        annexure_master_id: resolvedAnnexureMasterId,
        po_type: resolvedPoType || mappedMaster.po_type || "",
        annexure_code: mappedMaster.annexure_code,
        annexure_version: mappedMaster.version,
        po_number: mappedPo.tokenData.po_number || "",
        generated_at: new Date().toISOString()
      }
    });

    let gcsObjectFieldUpdated = false;
    try {
      await updatePurchaseOrderInstance(instance_id, {
        PO_GCS_Object_Name: uploaded.objectName
      });
      gcsObjectFieldUpdated = true;
    } catch (updateError) {
      console.warn("Failed to update PO_GCS_Object_Name:", updateError.message);
    }

    let kissflowAttachment = {
      requested: Boolean(attach_to_kissflow),
      attached: false,
      field_id: attachment_field_id,
      activity_instance_id: "",
      filename: ""
    };

    if (attach_to_kissflow) {
      const activityInstanceId = resolveActivityInstanceId(poResult.data);

      const safePoNumber = String(mappedPo.tokenData.po_number || instance_id)
        .replace(/[^a-zA-Z0-9._-]+/g, "_")
        .replace(/^_+|_+$/g, "");

      const runTimestamp = formatRunTimestampForFilename();
      const filename = `${safePoNumber || instance_id}_${runTimestamp}.pdf`;

      const attached = await attachPdfToProcessField({
        processId: config.kissflowModels.purchaseOrderProcessId,
        instanceId: instance_id,
        activityInstanceId,
        fieldId: attachment_field_id,
        filename,
        buffer: pdfBuffer,
        po: poResult.data
      });

      kissflowAttachment = {
        requested: true,
        attached: true,
        field_id: attachment_field_id,
        activity_instance_id: activityInstanceId,
        filename,
        status: attached.status,
        response_type: Array.isArray(attached.data) ? "array" : typeof attached.data,
        response: attached.data
      };
    }

    res.status(200).json({
      ok: true,
      app_env: config.service.appEnv,
      instance_id,
      po: {
        number: mappedPo.tokenData.po_number,
        date: mappedPo.tokenData.po_date,
        buyer_company_code: mappedPo.tokenData.buyer_company_code,
        seller_company_name: mappedPo.tokenData.seller_company_name,
        line_items_count: mappedPo.lineItems.length
      },
      letterhead: {
        found: Boolean(letterheadResult.found),
        matched_by: letterheadResult.matched_by || "none",
        lookup_company_code: mappedPo.tokenData.buyer_company_code || "",
        lookup_company_name: mappedPo.tokenData.buyer_company_name || "",
        company_code: mappedLetterhead?.company_code || letterheadResult.companyCode || "",
        header_applied: Boolean(mappedLetterhead?.header_html),
        footer_applied: Boolean(mappedLetterhead?.footer_html),
        header_left_logo_source: mappedLetterhead?.header_left_logo_source || "none",
        header_right_logo_source: mappedLetterhead?.header_right_logo_source || "none",
        header_logo_file_left_set: Boolean(mappedLetterhead?.header_logo_file_left_set),
        header_logo_file_right_set: Boolean(mappedLetterhead?.header_logo_file_right_set),
        margin_top_mm: mappedLetterhead?.margin_top_mm || margin_top_mm,
        margin_bottom_mm: mappedLetterhead?.margin_bottom_mm || margin_bottom_mm
      },
      annexure_master: {
        id: mappedMaster.id,
        resolved_from: annexure_master_id ? "annexure_master_id" : "po_type",
        requested_po_type: resolvedPoType || "",
        annexure_code: mappedMaster.annexure_code,
        annexure_name: mappedMaster.annexure_name,
        po_type: mappedMaster.po_type,
        version: mappedMaster.version,
        master_terms_count: mappedMaster.terms.length,
        process_terms_count: processTerms.length,
        final_terms_count: finalTerms.length,
        master_annexure_i_count: mappedMaster.annexure_i.length,
        process_annexure_i_count: processAnnexureI.length,
        final_annexure_i_count: finalAnnexureI.length
      },
      annexure_1: {
        process_rows_count: processAnnexure1Rows.length,
        image_rows_count: annexure1ImageCount,
        images_loaded_count: annexure1ImagesLoaded,
        images_rendered: annexure1ImagesLoaded > 0,
        image_fields: finalAnnexure1Rows
          .filter((row) => row.row_type === "image")
          .map((row) => row.image_field || "unknown")
      },
      gcs_object_field_updated: gcsObjectFieldUpdated,
      bytes: pdfBuffer.length,
      gcs_uri: uploaded.gcsUri,
      gcs_object_name: uploaded.objectName,
      signed_url_created: Boolean(uploaded.signedUrl),
      signed_url: uploaded.signedUrl,
      kissflow_attachment: kissflowAttachment
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      app_env: config.service.appEnv,
      error: error.message
    });
  }
});

app.listen(port, () => {
  console.log(`${config.service.name} listening on port ${port}`);
  console.log(`APP_ENV=${config.service.appEnv}`);
});
