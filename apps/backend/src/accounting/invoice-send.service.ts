/**
 * ACCT-R-24 / ND-INV-01 B2d — shared draft→sent path for manual POST /send and
 * POD auto-send after proforma convert. No new GL math; reuses existing guards + email queue.
 */
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueEmail } from "../email/queue.service.js";
import { postInvoiceGlIfEnabled } from "./invoice-gl.service.js";
import { enqueueTmsInvoicePushRequested } from "../qbo/tms-invoice-push-chain.service.js";
import {
  assertLoadRevenueHasSourceLoad,
  assertRevenueLinesHaveIncomeAccount,
  InvoiceLoadSourceRequiredError,
  InvoiceLineIncomeAccountRequiredError,
  type InvoiceLineGuardRow,
} from "./invoice-linkage-guards.js";
import { recomputeInvoiceTotals } from "./shared.js";
import { finalActiveDeliveryDepartureAt } from "./revrec-delivery-posting/poster.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";

/**
 * ACCT-F61 — an invoice must not bill a delivery the system cannot evidence.
 *
 * This file's own header says "POD auto-send after proforma convert" and its proforma refusal says
 * "Convert at POD (delivered) before send/A/R." In the code, "POD" means only that
 * `mdata.loads.status` reached delivered_pending_docs — a status three backend paths can set by
 * validating a status graph without ever reading `mdata.load_stops`. So the stated intent (bill at
 * proof of delivery) is not what is enforced (bill when someone clicked a status). Same defect class
 * the revenue latch carried until #3955.
 *
 * Why this matters more than the GL side: the GL already refuses without evidence (#3955), but this
 * path SENDS a real document to a customer, and IH35 factors receivables with Faro on a RECOURSE
 * basis. A factor funds against the invoice plus a signed POD; an invoice with no delivery evidence
 * behind it is the exact thing that comes back as a chargeback. Today the two halves are out of
 * step: the customer can be invoiced while the ledger correctly declines to recognize the revenue.
 *
 * Verified on prod 2026-08-01: INVOICE_PROFORMA_PIPELINE_ENABLED = true for TRANSP and USMCA (so the
 * office transition auto-converts and auto-sends at delivered_pending_docs), while all 20 load_stops
 * carry 0 actual_departure_at.
 *
 * DEFAULT OFF, AND WARN-ONLY UNTIL FLIPPED — deliberately. Enforcing immediately would block
 * invoicing entirely for a fleet whose drivers are not yet capturing departures through the PWA, and
 * stopping the cash cycle to fix an evidence gap is the wrong trade to make unilaterally. While OFF
 * it logs every send that lacks evidence, so the real exposure is measurable BEFORE it is enforced.
 * `isEnabled` returns false for a flag_key that has no registry row, so this is genuinely inert until
 * one is seeded — no migration in this PR.
 *
 * NOT a second copy of the evidence rule: it imports the same finalActiveDeliveryDepartureAt the
 * revenue latch uses, so "final active delivery stop" cannot come to mean two different things.
 */
const DELIVERY_EVIDENCE_FLAG = "INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE";

/** Dispatch withCompanyScope exposes query-only; accounting scope passes PoolClient. */
type SendClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type SendDraftInvoiceOk = { ok: true };
export type SendDraftInvoiceErr = {
  ok: false;
  code: 404 | 409 | 422;
  error: string;
  message?: string;
  factor_id?: string;
  factor_name?: string;
};
export type SendDraftInvoiceResult = SendDraftInvoiceOk | SendDraftInvoiceErr;

export async function sendDraftInvoice(
  client: SendClient,
  input: { invoiceId: string; operatingCompanyId: string; userId: string }
): Promise<SendDraftInvoiceResult> {
  const currentRes = await client.query(
    `SELECT * FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
    [input.invoiceId, input.operatingCompanyId]
  );
  const current = currentRes.rows[0] ?? null;
  if (!current) return { ok: false, code: 404, error: "invoice_not_found" };
  if (String(current.status) === "proforma") {
    return {
      ok: false,
      code: 409,
      error: "invoice_is_proforma",
      message:
        "Pro forma invoices are non-posting projections. Convert at POD (delivered) before send/A/R.",
    };
  }
  if (String(current.status) !== "draft") {
    return { ok: false, code: 409, error: "invoice_not_draft" };
  }

  const sendLinesRes = await client.query(
    `
      SELECT
        id::text,
        line_type::text,
        line_total_cents::bigint AS line_total_cents,
        account_id::text,
        qbo_item_id
      FROM accounting.invoice_lines
      WHERE invoice_id = $1::uuid
      ORDER BY display_order ASC, id ASC
    `,
    [input.invoiceId]
  );
  const sendLines = sendLinesRes.rows as InvoiceLineGuardRow[];
  try {
    assertLoadRevenueHasSourceLoad(
      current.source_load_id ? String(current.source_load_id) : null,
      sendLines
    );
    assertRevenueLinesHaveIncomeAccount(input.operatingCompanyId, sendLines);
  } catch (guardErr) {
    if (guardErr instanceof InvoiceLoadSourceRequiredError) {
      return { ok: false, code: 409, error: "invoice_load_source_required", message: guardErr.message };
    }
    if (guardErr instanceof InvoiceLineIncomeAccountRequiredError) {
      return {
        ok: false,
        code: 422,
        error: "invoice_line_income_account_required",
        message: guardErr.message,
      };
    }
    throw guardErr;
  }

  // ACCT-F61 — DELIVERY-EVIDENCE GATE. Inert until INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE is
  // enabled per entity; when OFF it only WARNS, so the exposure is visible before it is enforced.
  if (current.source_load_id) {
    const departedAt = await finalActiveDeliveryDepartureAt(
      client as never,
      input.operatingCompanyId,
      String(current.source_load_id)
    );
    if (!departedAt) {
      const enforce = await isEnabled(client as never, DELIVERY_EVIDENCE_FLAG, {
        operating_company_id: input.operatingCompanyId,
      });
      if (enforce) {
        return {
          ok: false,
          code: 409,
          error: "delivery_evidence_missing",
          message:
            `Load ${String(current.source_load_id)} has no actual_departure_at on its final active ` +
            `delivery stop. This invoice bills a delivery the system cannot evidence — capture the ` +
            `driver's departure, or send it manually after confirming delivery by another means.`,
        };
      }
      console.warn(
        {
          invoice_id: input.invoiceId,
          load_id: String(current.source_load_id),
          operating_company_id: input.operatingCompanyId,
          flag: DELIVERY_EVIDENCE_FLAG,
        },
        "acct_f61_invoice_sent_without_delivery_evidence"
      );
    }
  }

  const invoiceDate = String(current.issue_date);
  const noaCheck = await client.query(
    `
      SELECT
        f.id::text AS factor_id,
        f.name AS factor_name,
        f.noa_stamp_text,
        f.noa_remit_to_name
      FROM factoring.customer_factor_assignment a
      JOIN factoring.factor f ON f.id = a.factor_id
      WHERE a.tenant_id = $1::uuid
        AND a.customer_id = $2::uuid
        AND a.effective_from <= $3::date
        AND (a.effective_to IS NULL OR a.effective_to > $3::date)
      ORDER BY a.effective_from DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, current.customer_id, invoiceDate]
  );
  const noaRow = noaCheck.rows[0] ?? null;
  if (noaRow && !noaRow.noa_stamp_text && !noaRow.noa_remit_to_name) {
    return {
      ok: false,
      code: 422,
      error: "noa_config_missing",
      factor_id: String(noaRow.factor_id),
      factor_name: String(noaRow.factor_name),
    };
  }

  await recomputeInvoiceTotals(client, input.invoiceId);
  await client.query(
    `
      UPDATE accounting.invoices
      SET status = 'sent',
          sent_at = now(),
          updated_at = now(),
          updated_by_user_id = $2
      WHERE id = $1
        AND operating_company_id = $3::uuid
        AND status = 'draft'
    `,
    [input.invoiceId, input.userId, input.operatingCompanyId]
  );
  // ACCT-F100 — OWNER RULING 2026-08-03: an invoice posts to the GL on Finalize/Post OR Send,
  // whichever comes FIRST. This is the SEND arm. Idempotent at the poster's posting-batch key, so if
  // the invoice was already finalized-and-posted this is a no-op rather than a double-post — which is
  // what makes "whichever comes first" implementable without inventing our own posted flag.
  //
  // Measured before this existed: 11,979 invoices on prod against 2 posting batches of type 'invoice',
  // both from 2026-05-19 and both posted by hand. The engine handled 'invoice' the whole time; nothing
  // ever called it on the lifecycle.
  //
  // A post failure is SURFACED, never swallowed, and never rolls back an invoice the customer has
  // already been sent — the send is a business act that stands on its own. Retriable via the existing
  // manual post endpoint.
  const invoiceGl = await postInvoiceGlIfEnabled(input.operatingCompanyId, input.invoiceId, {
    userId: input.userId,
  });
  if (!invoiceGl.posted && invoiceGl.reason === "post_failed") {
    await appendCrudAudit(
      client,
      input.userId,
      "accounting.invoice.gl_post_failed",
      {
        resource_type: "accounting.invoices",
        resource_id: input.invoiceId,
        operating_company_id: input.operatingCompanyId,
        code: invoiceGl.code,
        message: invoiceGl.message,
      },
      "warning",
      "ACCT-F100-INVOICE-AR-GL"
    );
  }

  await appendCrudAudit(
    client,
    input.userId,
    "accounting.invoices.sent",
    {
      resource_type: "accounting.invoices",
      resource_id: input.invoiceId,
      operating_company_id: input.operatingCompanyId,
    },
    "info",
    "P3-T11.20.2-INVOICE-FLOW"
  );
  // Dispatch withCompanyScope is query-shaped; enqueue requires PoolClient (same runtime client).
  await enqueueTmsInvoicePushRequested(client as PoolClient, {
    operating_company_id: input.operatingCompanyId,
    invoice_id: input.invoiceId,
    operation: "update",
  });

  const notifyRes = await client.query(
    `
      SELECT
        i.display_id::text AS display_id,
        i.issue_date::text AS issue_date,
        i.currency_code::text AS currency_code,
        i.total_cents::bigint AS total_cents,
        i.customer_notes,
        i.internal_notes,
        c.customer_name::text AS customer_name,
        COALESCE(
          NULLIF(TRIM(c.ap_email), ''),
          NULLIF(TRIM(c.billing_email), ''),
          NULLIF(TRIM(c.ar_email), ''),
          NULLIF(TRIM(i.ar_email_snapshot), '')
        ) AS customer_email
      FROM accounting.invoices i
      JOIN mdata.customers c
        ON c.id = i.customer_id
       AND c.operating_company_id = i.operating_company_id
       AND c.operating_company_id = $2
      WHERE i.id = $1
        AND i.operating_company_id = $2
      LIMIT 1
    `,
    [input.invoiceId, input.operatingCompanyId]
  );
  const notify = notifyRes.rows[0] ?? null;
  const customerEmail = notify?.customer_email ? String(notify.customer_email).trim() : "";
  if (customerEmail && notify) {
    const total = (Number(notify.total_cents ?? 0) / 100).toFixed(2);
    void enqueueEmail({
      operatingCompanyId: input.operatingCompanyId,
      toAddresses: [customerEmail],
      subject: `Invoice ${notify.display_id} — IH 35 TMS`,
      templateKey: "invoice-send",
      templateVars: {
        invoiceDisplayId: String(notify.display_id ?? ""),
        customerName: String(notify.customer_name ?? "Customer"),
        issueDate: String(notify.issue_date ?? ""),
        currency: String(notify.currency_code ?? "USD"),
        total,
        memo: String(notify.customer_notes ?? notify.internal_notes ?? ""),
      },
      queuedByUserId: input.userId,
    }).catch(() => undefined);
  }

  return { ok: true };
}
