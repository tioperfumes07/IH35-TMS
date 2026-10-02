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
  assertIssuedInvoiceAuthorizedIfRolling,
  InvoiceOnRollingLoadNeedsAuthorizationError,
  type InvoiceLineGuardRow,
} from "./invoice-linkage-guards.js";
import { recomputeInvoiceTotals } from "./shared.js";
import { finalActiveDeliveryDepartureAt, fireRevrecLatchOnInvoiceIssued } from "./revrec-delivery-posting/poster.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { assertSubjectMayCloseOnClient } from "../driver-finance/feed-gate/feed-gate.service.js";
import { syncLoadStatusToBillingInClientTx } from "../dispatch/load-billing-lifecycle.service.js";

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

// Lead ruling, item 2 P0 (2026-09-22, "A CLOSED SETTLEMENT IS DELIVERY EVIDENCE"): same
// two-value LoadCreateSource shape as createLoadWithFullSideEffects -- an undeclared mode fails
// closed as live_feed, exactly the current, unchanged behavior. historical_backfill is the ONLY
// mode where evidence beyond a real stop departure is ever accepted, and it is always RECORDED
// (delivery_evidence_source / delivery_evidence_recorded_at, migration 202614240000), never a
// silent pass -- "a backfill that cannot name its evidence source still fails closed."
export type InvoiceSendMode = "live_feed" | "historical_backfill";

type DeliveryEvidenceSource =
  | "stop_actual_departure"
  | "closed_settlement"
  | "faro_invoice_line"
  | "owner_source_document";

/**
 * ROUND 290 (Lead order, 2026-09-30) — a NARROW, explicit, human-named exception for a genuinely
 * load-less invoice that bills real freight the company already carried and already handed the
 * customer a signed PDF for (e.g. a self-carried invoice with no TMS dispatch record at all). This
 * is NOT a bypass: it requires BOTH mode==='historical_backfill' (never the default live_feed path)
 * AND a non-empty, named `documentRef` — there is no default and no empty-string acceptance, so a
 * live send can never pick this up by omission. It only fires for the `no_source_load` evidence
 * shape (a load-less invoice) — a load WITH a departure/settlement/Faro-line gap still falls through
 * to backfillDeliveryEvidence()/the fail-closed block exactly as before, unchanged. "NOBODY WEAKENS
 * THE GATE AND NOBODY CODES AROUND IT" — this adds one real, auditable evidence class; it does not
 * touch or relax any existing check.
 */
export type ManualDeliveryEvidence = { source: "owner_source_document"; documentRef: string };

/**
 * mode='historical_backfill' ONLY: does a closed/locked driver settlement carry this load, or
 * does a Faro invoice line reference it directly? Reuses existing tables -- no new engine, no new
 * GL math. Checked in this order because a settlement is closer to "this specific load was
 * delivered and paid" than a factoring purchase is.
 */
async function backfillDeliveryEvidence(
  client: SendClient,
  operatingCompanyId: string,
  loadId: string
): Promise<DeliveryEvidenceSource | null> {
  const settlementRes = await client.query<{ id: string }>(
    `
      SELECT ds.id::text
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
       WHERE sl.operating_company_id = $1::uuid
         AND sl.load_id = $2::uuid
         AND ds.status IN ('closed', 'locked')
       LIMIT 1
    `,
    [operatingCompanyId, loadId]
  );
  if (settlementRes.rows.length > 0) return "closed_settlement";

  const faroRes = await client.query<{ id: string }>(
    `SELECT id::text FROM factor.faro_invoice_lines WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND superseded_at IS NULL LIMIT 1`,
    [operatingCompanyId, loadId]
  );
  if (faroRes.rows.length > 0) return "faro_invoice_line";

  return null;
}

export async function sendDraftInvoice(
  client: SendClient,
  input: {
    invoiceId: string;
    operatingCompanyId: string;
    userId: string;
    mode?: InvoiceSendMode;
    manualEvidence?: ManualDeliveryEvidence;
  }
): Promise<SendDraftInvoiceResult> {
  const mode: InvoiceSendMode = input.mode === "historical_backfill" ? "historical_backfill" : "live_feed";
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

  // FACTOR-BUT-NOT-DELIVERED WRITE BLOCK -- see invoice-linkage-guards.ts for the measurement and
  // the owner's ruling. Read the load's CURRENT status and any ACTIVE (non-revoked) manual delivery
  // authorization together, so an invoice can never be issued on freight that is still rolling
  // unless the customer's approval is on record. This runs BEFORE the line guards because it is a
  // question about the load, not about the lines, and it must refuse even a perfectly-formed invoice.
  const rollingLoadId = current.source_load_id ? String(current.source_load_id) : null;
  if (rollingLoadId) {
    const rollingRes = await client.query(
      `
        SELECT
          l.status::text AS load_status,
          EXISTS (
            SELECT 1
            FROM dispatch.manual_delivery_authorizations mda
            WHERE mda.load_id = l.id
              AND mda.operating_company_id = l.operating_company_id
              AND mda.revoked_at IS NULL
          ) AS has_active_authorization
        FROM mdata.loads l
        WHERE l.id = $1::uuid AND l.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [rollingLoadId, input.operatingCompanyId]
    );
    const rolling = rollingRes.rows[0] ?? null;
    if (rolling) {
      try {
        assertIssuedInvoiceAuthorizedIfRolling(
          input.invoiceId,
          rolling.load_status ? String(rolling.load_status) : null,
          rolling.has_active_authorization === true
        );
      } catch (rollingErr) {
        if (rollingErr instanceof InvoiceOnRollingLoadNeedsAuthorizationError) {
          return {
            ok: false,
            code: 409,
            error: "invoice_on_rolling_load_needs_authorization",
            message: rollingErr.message,
          };
        }
        throw rollingErr;
      }
    }
  }

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
  let evidenceReason: "no_source_load" | "no_departure_on_final_delivery_stop" | null = current.source_load_id
    ? (await finalActiveDeliveryDepartureAt(
        client as never,
        input.operatingCompanyId,
        String(current.source_load_id)
      ))
      ? null
      : ("no_departure_on_final_delivery_stop" as const)
    : ("no_source_load" as const);

  // ROUND 290 manual evidence — mode='historical_backfill' ONLY, ONLY for the no_source_load
  // shape (a genuinely load-less invoice), and ONLY when the caller explicitly names a real
  // document. Checked before the load-based backfill below because a load-less invoice has
  // nothing for that function to query against (it requires a loadId). Never inferred, never
  // defaulted -- input.manualEvidence must be supplied by the caller for this exact invoice.
  if (
    evidenceReason === "no_source_load" &&
    mode === "historical_backfill" &&
    input.manualEvidence?.source === "owner_source_document" &&
    input.manualEvidence.documentRef?.trim()
  ) {
    await client.query(
      `UPDATE accounting.invoices SET delivery_evidence_source = $2, delivery_evidence_recorded_at = now() WHERE id = $1 AND operating_company_id = $3::uuid`,
      [input.invoiceId, "owner_source_document", input.operatingCompanyId]
    );
    await appendCrudAudit(
      client as never,
      input.userId,
      "accounting.invoice.delivery_evidence_backfilled",
      {
        invoice_id: input.invoiceId,
        load_id: null,
        delivery_evidence_source: "owner_source_document",
        document_ref: input.manualEvidence.documentRef.trim(),
        operating_company_id: input.operatingCompanyId,
        mode,
      },
      "info",
      "ACCT-F61-BACKFILL-EVIDENCE-MANUAL"
    );
    evidenceReason = null;
  }

  // Lead ruling item 2 P0: mode='historical_backfill' ONLY, and only when the load itself is
  // known (a no-load invoice has nothing to check a settlement/Faro line against — that shape
  // still falls straight through to the fail-closed block below, same as live_feed). A real stop
  // departure (evidenceReason === null already) is never overridden or re-checked here -- this
  // only fires when the live_feed-shaped check above found nothing.
  if (evidenceReason === "no_departure_on_final_delivery_stop" && mode === "historical_backfill" && current.source_load_id) {
    const backfillSource = await backfillDeliveryEvidence(
      client,
      input.operatingCompanyId,
      String(current.source_load_id)
    );
    if (backfillSource) {
      await client.query(
        `UPDATE accounting.invoices SET delivery_evidence_source = $2, delivery_evidence_recorded_at = now() WHERE id = $1 AND operating_company_id = $3::uuid`,
        [input.invoiceId, backfillSource, input.operatingCompanyId]
      );
      await appendCrudAudit(
        client as never,
        input.userId,
        "accounting.invoice.delivery_evidence_backfilled",
        {
          invoice_id: input.invoiceId,
          load_id: String(current.source_load_id),
          delivery_evidence_source: backfillSource,
          operating_company_id: input.operatingCompanyId,
          mode,
        },
        "info",
        "ACCT-F61-BACKFILL-EVIDENCE"
      );
      evidenceReason = null;
    }
    // backfillSource === null falls through: evidenceReason stays set, and the block below
    // fails closed regardless of the DELIVERY_EVIDENCE_FLAG's enforce/warn-only setting for
    // live_feed -- "a backfill that cannot name its evidence source still fails closed" is not
    // conditional on that flag, it is unconditional for this mode.
    if (!backfillSource) {
      return {
        ok: false,
        code: 409,
        error: "delivery_evidence_missing",
        message:
          `Load ${String(current.source_load_id)} has no stop-actual departure, no closed/locked ` +
          `settlement, and no Faro invoice line — historical_backfill mode cannot name a delivery ` +
          `evidence source for it, so it fails closed the same as a live send would.`,
      };
    }
  }

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

  // FEED GATE (owner law 2026-10-01): an invoice is sent only when its linkage is complete — customer, live
  // line with income account, total = lines, and (when it has a load) the load's customer/driver/unit/trailer,
  // trip type, geocoded + stamped stops, rate = invoice, factoring link. Runs now on this client; throws
  // FeedGateError('feed_gate_blocked') with every red row, which rolls the send back.
  await assertSubjectMayCloseOnClient(client as never, input.operatingCompanyId, "invoice", input.invoiceId, input.userId);

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

    // AUTH-105 root cause (2026-09-28): sendDraftInvoice never called the LOAD-CLOSE-LIFECYCLE
    // sync at all -- settlements.routes.ts's finalize handler calls syncSettlementLoadsToBilling
    // the MOMENT a settlement locks (condition (a)), but that only advances a load whose invoice
    // is ALREADY sent (condition (b)) at that exact instant. A load settled BEFORE its invoice is
    // sent (the ordinary case: driver pay finalizes on its own cadence, revenue billing on its
    // own) has (b) become true only HERE, later, and nothing re-fired the walk -- the load stayed
    // stuck at completed_docs_received forever with a closed settlement and a sent invoice, live-
    // confirmed on 13503/13504/13509/13539 (AUTH-105 one-shot). This is the SAME forward-walk
    // every other trigger (invoice-paid, factoring-funded, settlement-finalize) already uses, in
    // the SAME transaction as the send (matching syncLoadStatusToBillingInClientTx's own
    // documented in-tx caller pattern, e.g. the Faro CSV import) -- never a new decision, never a
    // new status, no-op when the load isn't eligible yet.
    await syncLoadStatusToBillingInClientTx(client as never, {
      operatingCompanyId: input.operatingCompanyId,
      loadId: String(current.source_load_id),
      actorUserId: input.userId,
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
  // INVOICE-SEND-LATCH-OWNS-AR (CC-2, 2026-10-01): when the load's DISP-01 two-event delivery latch already recognized
  // its revenue (an active load_revenue_recognition_postings row), the invoice poster refuses on purpose
  // (INVOICE_REVREC_LATCH_OWNS_LOAD) and the A/R posts as the latch's Event 2 (DR A/R / CR Unbilled) — fired by
  // fireRevrecLatchOnInvoiceIssued above, on this same send. That is the invoice posting, not a failed post. Without
  // this exemption #23827's refusal blocked EVERY send for a delivered, latch-recognized load (prod 13626 / 13637).
  const latchOwnsAr = !invoiceGl.posted && invoiceGl.reason === "post_failed" && invoiceGl.code === "INVOICE_REVREC_LATCH_OWNS_LOAD";
  if (!invoiceGl.posted && invoiceGl.reason === "post_failed" && !latchOwnsAr) {
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
  // OWNER LAW 2026-10-01: "an invoice created in the app, through a load or manually, must always post to all
  // correct accounts." With the entity's posting flag ON, a poster failure now REFUSES the send (the transaction
  // rolls back: no 'sent' invoice without its A/R journal entry). The audit row above still records the cause.
  if (!invoiceGl.posted && invoiceGl.reason === "post_failed" && !latchOwnsAr) {
    throw new Error(`invoice_send_refused_gl_post_failed:${invoiceGl.code ?? "unknown"}:${invoiceGl.message ?? ""}`);
  }
  // Lead ROUND 332 item 1: issuing the document IS the posting event (QuickBooks / NetSuite have no send-without-post).
  // A disabled poster used to return { posted: false, reason: "posting_disabled" } and the send stamped 'sent' anyway
  // — an invoice billed to a customer that the ledger never heard of. The flag may gate the poster's rollout, but then
  // it gates ISSUANCE for that entity too. The only { posted: false } a send accepts is the delivery latch having
  // posted this load's A/R already (revrec_latch_already_posted_ar / INVOICE_REVREC_LATCH_OWNS_LOAD).
  if (!invoiceGl.posted && invoiceGl.reason === "posting_disabled") {
    throw new Error("invoice_send_refused_posting_disabled: the invoice A/R poster is off for this entity, so the invoice cannot be issued");
  }
  if (!invoiceGl.posted && invoiceGl.reason !== "revrec_latch_already_posted_ar" && !latchOwnsAr) {
    throw new Error(`invoice_send_refused_not_posted:${invoiceGl.reason}`);
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
