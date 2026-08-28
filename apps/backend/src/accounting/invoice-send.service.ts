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
  assertInvoiceHasRevenueLines,
  assertRevenueLinesHaveIncomeAccount,
  InvoiceLoadSourceRequiredError,
  InvoiceHasNoRevenueLinesError,
  InvoiceLineIncomeAccountRequiredError,
  type InvoiceLineGuardRow,
} from "./invoice-linkage-guards.js";
import { recomputeInvoiceTotals } from "./shared.js";
import { finalActiveDeliveryDepartureAt, fireRevrecLatchOnInvoiceIssued } from "./revrec-delivery-posting/poster.service.js";
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
 * every unevidenced send appends a durable, append-only row to audit.audit_events
 * (`accounting.invoice.sent_without_delivery_evidence`) atomically with the send, so the real
 * exposure is COUNTABLE — not merely logged — BEFORE anyone decides to enforce it.
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
    `SELECT * FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
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
    // ACCT-F124 — FIRST, because the two guards below iterate the lines and therefore pass vacuously
    // on an empty set. INV-2026-00004 sent with zero lines and left a receivable the poster correctly
    // refused to recognise.
    assertInvoiceHasRevenueLines(input.operatingCompanyId, input.invoiceId, sendLines);
    assertLoadRevenueHasSourceLoad(
      current.source_load_id ? String(current.source_load_id) : null,
      sendLines
    );
    assertRevenueLinesHaveIncomeAccount(input.operatingCompanyId, sendLines);
  } catch (guardErr) {
    if (guardErr instanceof InvoiceHasNoRevenueLinesError) {
      // 422, matching the sibling line-validity refusals: the request is well-formed, the invoice is
      // not yet sendable.
      return { ok: false, code: 422, error: "invoice_has_no_revenue_lines", message: guardErr.message };
    }
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

  // ACCT-F61 / LV-012 — DELIVERY-EVIDENCE GATE. Inert until INVOICE_SEND_REQUIRES_DELIVERY_EVIDENCE
  // is enabled per entity; when OFF it only WARNS, so the exposure is visible before it is enforced.
  //
  // LV-012: this gate used to sit INSIDE `if (current.source_load_id)`. That inverted the control —
  // an invoice with NO load at all has zero delivery evidence BY DEFINITION, the weakest case of all,
  // and it skipped the check entirely and sent clean. Measured on prod: 11,981 of 11,982 invoices
  // carry no source_load_id (236 of them already status='sent'), so the gate could see exactly ONE
  // invoice and was blind to the rest. For a book factored on RECOURSE, a no-load invoice is at least
  // as risky as a load whose final delivery stop lacks a departure — it is not an exemption.
  //
  // Evidence is now evaluated for EVERY invoice, and the two failure shapes are recorded distinctly
  // so the population can be split when the owner decides whether to enforce.
  const evidenceReason = current.source_load_id
    ? (await finalActiveDeliveryDepartureAt(
        client as never,
        input.operatingCompanyId,
        String(current.source_load_id)
      ))
      ? null
      : ("no_departure_on_final_delivery_stop" as const)
    : ("no_source_load" as const);

  if (evidenceReason) {
    const enforce = await isEnabled(client as never, DELIVERY_EVIDENCE_FLAG, {
      operating_company_id: input.operatingCompanyId,
    });
    if (enforce) {
      return {
        ok: false,
        code: 409,
        error: "delivery_evidence_missing",
        message:
          evidenceReason === "no_source_load"
            ? `This invoice is not linked to a load, so the system holds no delivery evidence for it. ` +
              `Link the load it bills, or send it manually after confirming delivery by another means.`
            : `Load ${String(current.source_load_id)} has no actual_departure_at on its final active ` +
              `delivery stop. This invoice bills a delivery the system cannot evidence — capture the ` +
              `driver's departure, or send it manually after confirming delivery by another means.`,
      };
    }
    // The exposure has to be COUNTABLE, not just tailable. A console.warn on Render is ephemeral: it
    // cannot be queried, aggregated or tied out, so "measure before enforcing" was never satisfied by
    // logging alone. Written through appendCrudAudit on the SAME client as the send, so the row
    // commits with the invoice or not at all — the count cannot silently under-report, which is what
    // a factoring recourse-risk figure has to be before anyone relies on it.
    await appendCrudAudit(
      client as never,
      input.userId,
      "accounting.invoice.sent_without_delivery_evidence",
      {
        invoice_id: input.invoiceId,
        // null when the invoice has no load — the reason field says which shape this is.
        load_id: current.source_load_id ? String(current.source_load_id) : null,
        reason: evidenceReason,
        operating_company_id: input.operatingCompanyId,
        flag: DELIVERY_EVIDENCE_FLAG,
        enforcement: "warn_only",
      },
      "warning",
      "ACCT-F61-WIRE-04"
    );
    console.warn(
      {
        invoice_id: input.invoiceId,
        load_id: current.source_load_id ? String(current.source_load_id) : null,
        reason: evidenceReason,
        operating_company_id: input.operatingCompanyId,
        flag: DELIVERY_EVIDENCE_FLAG,
      },
      "acct_f61_invoice_sent_without_delivery_evidence"
    );
  }

  const invoiceDate = current.issue_date instanceof Date
    ? current.issue_date.toISOString().slice(0, 10)
    : String(current.issue_date).slice(0, 10);
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

  // OWNER DECISION B (2026-08-27 23:00 CT,
  // docs/lockdown/OWNER-DECISION-ACCT-F5692-OPTION-B-2026-08-27.md) — invoice ISSUANCE fires revrec
  // Event 2 when earn already exists, in addition to dispatch reaching completed_docs_received. This
  // covers BOTH this manual /send endpoint AND the POD-auto-send-after-delivery path in
  // delivery-evidence-latch.ts, since both route through this function. GO-0014
  // event2-silent-on-issued-invoices extracted this into fireRevrecLatchOnInvoiceIssued
  // (poster.service.ts, §9.0.17 one helper) so accounting/invoices-bulk.routes.ts's mark_sent/
  // set_status writers -- which reach the SAME issued statuses through a separate code path -- share
  // it instead of staying silent. Behavior here is unchanged byte-for-byte.
  if (current.source_load_id) {
    await fireRevrecLatchOnInvoiceIssued(client as object, {
      operating_company_id: input.operatingCompanyId,
      source_load_id: String(current.source_load_id),
      actor_user_id: input.userId,
      invoice_id: input.invoiceId,
    });
  }

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
  const invoiceGl = await postInvoiceGlIfEnabled(client as never, input.operatingCompanyId, input.invoiceId, {
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
        -- ACCT-F5786 — mdata.customers' customers_select RLS excludes a deactivated customer for a
        -- non-bypass reader. A plain JOIN here dropped the WHOLE row, so a deactivated customer's
        -- invoice never reached even i.ar_email_snapshot (which lives on accounting.invoices itself,
        -- not gated by customers RLS at all) — a real transmission address could exist and still
        -- never be read. Same class as ACCT-F5611/5767/5768/5784/5785: LEFT JOIN + the existing
        -- same-company label resolver, customers_select untouched.
        COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(i.customer_id, i.operating_company_id))::text AS customer_name,
        COALESCE(
          NULLIF(TRIM(c.ap_email), ''),
          NULLIF(TRIM(c.billing_email), ''),
          NULLIF(TRIM(c.ar_email), ''),
          NULLIF(TRIM(i.ar_email_snapshot), '')
        ) AS customer_email
      FROM accounting.invoices i
      LEFT JOIN mdata.customers c
        ON c.id = i.customer_id
       AND c.operating_company_id = i.operating_company_id
       AND c.operating_company_id = $2::uuid
      WHERE i.id = $1
        AND i.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [input.invoiceId, input.operatingCompanyId]
  );
  const notify = notifyRes.rows[0] ?? null;
  const customerEmail = notify?.customer_email ? String(notify.customer_email).trim() : "";
  // LV-013 — an invoice stamped status='sent' must not silently transmit NOTHING.
  //
  // This block was `if (customerEmail && notify)` with a fire-and-forget `void enqueueEmail(...)
  // .catch(() => undefined)`. A customer with no AP/billing/AR email on file therefore produced no
  // queue row at all, while the invoice had already been stamped 'sent' above — the ledger asserted a
  // customer was billed when nothing was ever produced, and an enqueue failure was swallowed on the
  // way out. Both cases are now recorded durably on the SAME client as the send, so "issued to A/R"
  // and "actually transmitted" stop being the same claim.
  //
  // The invoice legitimately stays 'sent' — it IS issued and posted to A/R. What was missing is a
  // truthful record that the transmission never happened; changing the invoice status vocabulary
  // needs a migration and an owner decision, and is not smuggled in here.
  if (customerEmail && notify) {
    const total = (Number(notify.total_cents ?? 0) / 100).toFixed(2);
    try {
      await enqueueEmail({
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
      });
    } catch (err) {
      await appendCrudAudit(
        client as never,
        input.userId,
        "accounting.invoice.transmission_enqueue_failed",
        {
          invoice_id: input.invoiceId,
          operating_company_id: input.operatingCompanyId,
          to: customerEmail,
          error: err instanceof Error ? err.message : String(err),
        },
        "warning",
        "LV-013"
      );
    }
  } else {
    await appendCrudAudit(
      client as never,
      input.userId,
      "accounting.invoice.sent_without_transmission",
      {
        invoice_id: input.invoiceId,
        operating_company_id: input.operatingCompanyId,
        reason: notify
          ? "customer has no ap_email / billing_email / ar_email / ar_email_snapshot on file"
          : "no customer row resolved for this invoice in this entity",
      },
      "warning",
      "LV-013"
    );
  }

  return { ok: true };
}
