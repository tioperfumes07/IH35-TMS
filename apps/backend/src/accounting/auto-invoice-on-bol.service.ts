/**
 * ROUND 285.4.10 / #60 — Invoice auto-generates when a load is delivered/closed AND a BOL is
 * already saved in docs.files, then lands in the Faro (factoring) submission queue.
 *
 * OWNER (ROUND 272 / 285.4.10, verbatim intent): "THE INVOICE WHEN GENERATED, EITHER BY CLOSING A
 * LOAD DELIVERED ETC, IF THE BOL IS ALREADY SAVED IN OUR SYSTEM, THE DRIVER UPLOADED THE PHOTO
 * THROUGH THE APP, MUST GENERATE THE INVOICE... SHOULD BE SENT AUTOMATICALLY TO FACTORING SO WE
 * CAN SEND TO FARO FOR THE PURCHASE."
 *
 * BOUNDARY: a proforma is a cash-flow projection and must NOT post to the books. This path only
 * creates/converts an official draft and sends it (A/R). Factoring auto-submit (FACT-DELIVERED-AUTO)
 * already runs after-commit from the delivery latch when the invoice is `sent` — callers that fire
 * this AFTER a late BOL upload must also call autoSubmitDeliveredLoadToFactor themselves.
 *
 * BOL MISSING: never silent. Audits `accounting.invoice.awaiting_bol` and returns
 * `{ ok: false, reason: "awaiting_bol" }` so the load sits in the named awaiting-BOL queue.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { buildInvoiceFromLoad } from "./from-load.js";
import { convertProformaToOfficial } from "./proforma-convert.service.js";
import { sendDraftInvoice } from "./invoice-send.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type AutoInvoiceOnBolInput = {
  operatingCompanyId: string;
  loadId: string;
  userId: string;
  /** When true, skip the INVOICE_PROFORMA_PIPELINE_ENABLED gate (BOL-upload retry path). */
  bypassPipelineFlag?: boolean;
};

export type AutoInvoiceOnBolResult =
  | { ok: true; invoiceId: string; created: boolean; converted: boolean; sent: boolean; bolFileId: string }
  | { ok: false; reason: "awaiting_bol" | "pipeline_off" | "no_invoice" | "send_failed" | "load_not_delivery"; detail?: string };

/** Shared BOL existence predicate — identical to dispatch/factoring-queue.routes.ts has_bol. */
export async function loadHasBolDocument(
  client: Queryable,
  loadId: string
): Promise<{ hasBol: boolean; fileId: string | null }> {
  const res = await client.query<{ file_id: string }>(
    `
      SELECT df.id::text AS file_id
      FROM docs.files df
      JOIN docs.file_links dfl ON dfl.file_id = df.id
      LEFT JOIN catalogs.file_categories dfc ON dfc.id = df.category_id
      WHERE dfl.entity_type = 'load'
        AND dfl.entity_id = $1::uuid
        AND dfl.deleted_at IS NULL
        AND df.deleted_at IS NULL
        AND df.upload_completed_at IS NOT NULL
        AND dfc.code = 'bol'
      ORDER BY df.upload_completed_at DESC NULLS LAST, df.created_at DESC
      LIMIT 1
    `,
    [loadId]
  );
  const fileId = res.rows[0]?.file_id ?? null;
  return { hasBol: Boolean(fileId), fileId };
}

async function linkBolToInvoice(
  client: Queryable,
  input: { fileId: string; invoiceId: string; userId: string }
): Promise<void> {
  await client.query(
    `
      INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
      VALUES ($1::uuid, 'invoice', $2::uuid, $3::uuid)
      ON CONFLICT (file_id, entity_type, entity_id) WHERE deleted_at IS NULL DO NOTHING
    `,
    [input.fileId, input.invoiceId, input.userId]
  );
}

/**
 * Ensure the delivered load has an official sent invoice with the BOL attached.
 * Idempotent: already-sent invoices just get the BOL link + audit, no double-send.
 */
export async function autoInvoiceOnBol(
  client: Queryable,
  input: AutoInvoiceOnBolInput
): Promise<AutoInvoiceOnBolResult> {
  if (!input.bypassPipelineFlag) {
    const pipelineOn = await isEnabled(client as never, "INVOICE_PROFORMA_PIPELINE_ENABLED", {
      operating_company_id: input.operatingCompanyId,
      user_uuid: input.userId,
    });
    if (!pipelineOn) return { ok: false, reason: "pipeline_off" };
  }

  const { hasBol, fileId: bolFileId } = await loadHasBolDocument(client, input.loadId);
  if (!hasBol || !bolFileId) {
    await appendCrudAudit(
      client,
      input.userId,
      "accounting.invoice.awaiting_bol",
      {
        resource_type: "mdata.loads",
        resource_id: input.loadId,
        operating_company_id: input.operatingCompanyId,
        load_id: input.loadId,
        waiting_for: "BOL",
        message: "Invoice auto-generation waiting for a saved BOL on this load.",
      },
      "info",
      "AUTO-INVOICE-ON-BOL"
    );
    return { ok: false, reason: "awaiting_bol" };
  }

  let created = false;
  let converted = false;

  const existing = await client.query<{ id: string; status: string }>(
    `
      SELECT id::text AS id, status::text AS status
      FROM accounting.invoices
      WHERE operating_company_id = $1::uuid
        AND source_load_id = $2::uuid
        AND voided_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );

  let invoiceId = existing.rows[0]?.id ?? "";
  let status = existing.rows[0]?.status ?? "";

  if (!invoiceId) {
    // No invoice yet — mint an official draft from the load (NOT a proforma: books boundary).
    const built = await buildInvoiceFromLoad(client, {
      userId: input.userId,
      operatingCompanyId: input.operatingCompanyId,
      loadId: input.loadId,
      asProforma: false,
    });
    invoiceId = String(built.invoice.id);
    status = String(built.invoice.status ?? "draft");
    created = !built.idempotent;
  }

  if (status === "proforma") {
    const conv = await convertProformaToOfficial(client, {
      operatingCompanyId: input.operatingCompanyId,
      loadId: input.loadId,
      userId: input.userId,
    });
    if (!conv.converted && !conv.invoiceId) {
      return { ok: false, reason: "no_invoice", detail: conv.reason };
    }
    invoiceId = conv.invoiceId || invoiceId;
    converted = Boolean(conv.converted);
    status = "draft";
  }

  let sent = false;
  if (status === "draft") {
    const sendResult = await sendDraftInvoice(client, {
      invoiceId,
      operatingCompanyId: input.operatingCompanyId,
      userId: input.userId,
    });
    if (!sendResult.ok) {
      return {
        ok: false,
        reason: "send_failed",
        detail: `${sendResult.error}${sendResult.message ? `:${sendResult.message}` : ""}`,
      };
    }
    sent = true;
  } else if (status !== "sent" && status !== "partially_paid" && status !== "paid") {
    // Unexpected status — still attach BOL, do not invent a send.
    await linkBolToInvoice(client, { fileId: bolFileId, invoiceId, userId: input.userId });
    return {
      ok: false,
      reason: "send_failed",
      detail: `invoice_status_${status}`,
    };
  }

  await linkBolToInvoice(client, { fileId: bolFileId, invoiceId, userId: input.userId });

  await appendCrudAudit(
    client,
    input.userId,
    "accounting.invoice.auto_generated_on_bol",
    {
      resource_type: "accounting.invoices",
      resource_id: invoiceId,
      operating_company_id: input.operatingCompanyId,
      load_id: input.loadId,
      bol_file_id: bolFileId,
      created,
      converted,
      sent,
    },
    "info",
    "AUTO-INVOICE-ON-BOL"
  );

  return { ok: true, invoiceId, created, converted, sent, bolFileId };
}

/**
 * Loads waiting on a BOL before auto-invoice — the named queue the owner asked for.
 * Delivery-evidence statuses only; cancelled/voided loads excluded.
 */
export async function listLoadsAwaitingBolInvoice(
  client: Queryable,
  operatingCompanyId: string
): Promise<
  Array<{
    load_id: string;
    load_number: string | null;
    status: string;
    customer_name: string | null;
    waiting_for: "BOL";
    has_invoice: boolean;
  }>
> {
  const res = await client.query<{
    load_id: string;
    load_number: string | null;
    status: string;
    customer_name: string | null;
    has_invoice: boolean;
  }>(
    `
      SELECT
        l.id::text AS load_id,
        l.load_number,
        l.status::text AS status,
        c.customer_name,
        EXISTS (
          SELECT 1 FROM accounting.invoices i
          WHERE i.source_load_id = l.id
            AND i.operating_company_id = l.operating_company_id
            AND i.voided_at IS NULL
            AND i.status NOT IN ('proforma')
        ) AS has_invoice
      FROM mdata.loads l
      LEFT JOIN mdata.customers c
        ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id
      WHERE l.operating_company_id = $1::uuid
        AND COALESCE(l.is_sample_data, false) IS NOT TRUE
        AND l.soft_deleted_at IS NULL
        AND l.status IN (
          'delivered_pending_docs'::mdata.load_status_enum,
          'completed_docs_received'::mdata.load_status_enum
        )
        AND NOT EXISTS (
          SELECT 1 FROM docs.files df
          JOIN docs.file_links dfl ON dfl.file_id = df.id
          LEFT JOIN catalogs.file_categories dfc ON dfc.id = df.category_id
          WHERE dfl.entity_type = 'load'
            AND dfl.entity_id = l.id
            AND dfl.deleted_at IS NULL
            AND df.deleted_at IS NULL
            AND df.upload_completed_at IS NOT NULL
            AND dfc.code = 'bol'
        )
      ORDER BY l.updated_at DESC
      LIMIT 200
    `,
    [operatingCompanyId]
  );
  return res.rows.map((r) => ({ ...r, waiting_for: "BOL" as const }));
}
