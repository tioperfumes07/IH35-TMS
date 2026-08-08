// ACCT-F100 / INVOICE-AR-GL — the gated auto-post entrypoint for an Invoice's internal A/R GL.
//
// THE DEFECT, MEASURED ON PROD (2026-08-03, positive control mdata.vendors=2,828):
//   accounting.invoices          11,979 rows
//   posting_batches type='invoice'    2 rows, both TRANSP, both dated 2026-05-19
// Two invoices have EVER posted, months ago, and almost certainly by hand through the manual
// posting endpoint. Everything since has sat as an unposted draft/sent invoice while A/R and revenue
// stayed blind to it.
//
// This is NOT a missing poster. postSourceTransaction already handles source_transaction_type
// 'invoice' — the two May batches prove the engine works end to end. What was missing is a TRIGGER:
// bills have bill-gl.service.ts wired into createBill (bills.service.ts:1433), and invoices had no
// equivalent anywhere in their lifecycle. Verified by diffing the two paths rather than assumed —
// there is no invoice-gl service in the tree and no call site on send/finalize.
//
// OWNER RULING 2026-08-03: an invoice posts when EITHER "Finalize/Post" OR "Send" happens, whichever
// comes FIRST. A plain draft stays unposted. Posting is idempotent — Send after Finalize must not
// double-post.
//
// IDEMPOTENCY IS NOT REIMPLEMENTED HERE. The posting engine keys a posting batch per
// (source_transaction_type, source_transaction_id) with an idempotency key, which is exactly how the
// bill path avoids double-posting on retry. Calling this twice yields one batch. That is the whole
// reason to reuse the poster rather than write a second one: a second writer is a second source of
// truth for "has this posted?", and those drift.
//
// NO NEW GL MATH — reuse only. Flag default OFF, per-entity override (POSTING_FLAG_KEYS).
// Flag OFF does NOT block sending: issuing an invoice is a business act; the send still succeeds and
// the caller receives an explicit unposted status, never a silent success.

import {
  postSourceTransaction,
  postSourceTransactionInClientTx,
  PostingEngineError,
} from "./posting-engine.service.js";

/** The caller's open transaction — posting must never open a second connection (LV-011). */
type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
import { isEnabled } from "../lib/feature-flags/service.js";
import { standingLatchJePredicate } from "./revrec-delivery-posting/poster.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

export const INVOICE_AR_GL_POSTING_FLAG_KEY = "INVOICE_AR_GL_POSTING_ENABLED";

type PostingResult = Awaited<ReturnType<typeof postSourceTransaction>>;

export type InvoiceGlPostOutcome =
  | { posted: false; reason: "posting_disabled" }
  | { posted: false; reason: "revrec_latch_already_posted_ar"; loadId: string }
  | { posted: false; reason: "post_failed"; code: string; message: string }
  | { posted: true; result: PostingResult };

/**
 * ACCT-F205 — THE INTERLOCK THAT WAS ONLY EVER A COMMENT.
 *
 * The two-event delivery latch (revrec-delivery-posting/poster.service.ts) posts, per load:
 *   earn: DR 1150 Unbilled Revenue / CR 4000 Income
 *   bill: DR 1100 A/R             / CR 1150 Unbilled Revenue
 * so by the time the `bill` event has fired, A/R AND revenue are already on the books for that load.
 *
 * That poster's own header says: "When this latch is ON for an entity, keep
 * INVOICE_AR_GL_POSTING_ENABLED OFF for load-sourced invoices (or extend the invoice poster to skip
 * income credit) — otherwise bill-first A/R would double-recognize revenue. Coordination is
 * owner-gated; both flags default OFF."
 *
 * THAT COORDINATION WAS NEVER ENFORCED IN CODE, and on prod BOTH flags are ON for USMCA and TRANSP.
 * The result is materialized and measured, on load L-20260806-0008 ($1,875.50):
 *   LATCH earn      DR 1150 187550 / CR 4000 187550
 *   LATCH bill      DR 1100 187550 / CR 1150 187550
 *   INVOICE f17a6483 DR 1100 187550 / CR 4000 187550   <-- A/R and Income BOTH counted twice
 * A/R overstated by $1,875.50 and revenue overstated by $1,875.50, on one load, silently.
 *
 * This is the sanctioned second option from that header, implemented per-LOAD rather than per-flag so
 * it holds no matter how the flags are set — a flag convention that nothing checks is not a control.
 *
 * IT USES standingLatchJePredicate ON PURPOSE. A latch whose journal entry has been reversed or voided
 * must NOT block the invoice: that poster's header documents exactly this trap ("the ACCT-F59 invoice
 * interlock would refuse that load's invoice forever"). Only a STANDING bill latch suppresses posting,
 * so a reversed latch correctly lets the invoice post the A/R itself.
 *
 * Invoices with no source load are untouched — there is no latch to collide with.
 */
async function loadHasStandingBillLatch(
  client: DbClient,
  operatingCompanyId: string,
  invoiceId: string
): Promise<string | null> {
  const res = await client.query<{ load_id: string }>(
    `
      SELECT r.load_id::text AS load_id
        FROM accounting.invoices i
        JOIN accounting.load_revenue_recognition_postings r
          ON r.load_id = i.source_load_id
         AND r.operating_company_id = i.operating_company_id
       WHERE i.id = $1::uuid
         AND i.operating_company_id = $2::uuid
         AND i.source_load_id IS NOT NULL
         AND r.event = 'bill'
         AND r.voided_at IS NULL
         AND COALESCE(r.is_active, true) = true
         AND ${standingLatchJePredicate("r")}
       LIMIT 1
    `,
    [invoiceId, operatingCompanyId]
  );
  return res.rows[0]?.load_id ?? null;
}

/**
 * Resolve INVOICE_AR_GL_POSTING_ENABLED for an entity (user override, then per-company override, then
 * default). Mirrors isBillGlPostingEnabled: withCurrentUser + set_config rather than withCompanyScope,
 * because the caller is already authenticated and entity-scoped and this flag read needs no membership
 * re-assertion.
 */
/**
 * LV-011 — reads the flag ON THE CALLER'S CLIENT.
 *
 * This used to open its own connection via withCurrentUser. Every caller is already inside a
 * transaction that has just UPDATEd the invoice row, so a second connection touching that row waited
 * on a lock the caller could not release until this call returned — a hang, not a deadlock Postgres
 * could detect and abort (the outer session sits idle-in-transaction, so there is no cycle in the
 * lock graph). Same client = same transaction = no second lock holder.
 */
export async function isInvoiceGlPostingEnabled(
  client: DbClient,
  operatingCompanyId: string,
  userId: string
): Promise<boolean> {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
  return isEnabled(client, INVOICE_AR_GL_POSTING_FLAG_KEY, {
    operating_company_id: operatingCompanyId,
    user_uuid: userId,
  });
}

/**
 * Post an invoice's balanced DR ar_control / CR revenue JE if the flag is ON for the entity.
 *
 * Safe to call on BOTH the finalize and the send path — the second call is a no-op at the poster's
 * idempotency key, which is what makes "whichever comes first" implementable without a status flag of
 * our own invention.
 *
 * A PostingEngineError (e.g. an unresolved revenue account for the entity) is surfaced as
 * `post_failed` — NOT swallowed, and NOT allowed to roll back an invoice the customer has already been
 * sent. It is retriable through the existing manual post endpoint. Any other error propagates.
 */
export async function postInvoiceGlIfEnabled(
  client: DbClient,
  operatingCompanyId: string,
  invoiceId: string,
  actor: { userId: string }
): Promise<InvoiceGlPostOutcome> {
  const enabled = await isInvoiceGlPostingEnabled(client, operatingCompanyId, actor.userId);
  if (!enabled) return { posted: false, reason: "posting_disabled" };

  // ACCT-F205 — refuse to post A/R and revenue a second time for a load the delivery latch has
  // already billed. Checked BEFORE the poster runs, because the poster is idempotent per invoice and
  // would happily create a genuinely new, genuinely balanced, genuinely wrong JE.
  const latchedLoadId = await loadHasStandingBillLatch(client, operatingCompanyId, invoiceId);
  if (latchedLoadId) {
    await appendCrudAudit(
      client,
      actor.userId,
      "accounting.invoice.gl_post.skipped_revrec_latch_already_posted",
      {
        resource_type: "accounting.invoices",
        invoice_id: invoiceId,
        load_id: latchedLoadId,
        operating_company_id: operatingCompanyId,
        reason:
          "the two-event delivery latch already posted DR A/R / CR Unbilled for this load, so posting " +
          "the invoice would debit A/R and credit revenue a SECOND time for the same freight. The " +
          "invoice remains a valid customer document; only its duplicate GL posting is suppressed.",
      },
      "warning",
      "ACCT-F205"
    );
    return { posted: false, reason: "revrec_latch_already_posted_ar", loadId: latchedLoadId };
  }

  try {
    // LV-011: post INSIDE the caller's transaction (postSourceTransactionInClientTx) instead of
    // postSourceTransaction, which opens its own connection via withCurrentUser and therefore blocked
    // forever on the invoice row this very transaction had just locked. Same poster, same GL math —
    // only the connection ownership changes.
    const result = await postSourceTransactionInClientTx(
      client,
      {
        operating_company_id: operatingCompanyId,
        source_transaction_type: "invoice",
        source_transaction_id: invoiceId,
      },
      { userId: actor.userId }
    );
    return { posted: true, result };
  } catch (err) {
    if (err instanceof PostingEngineError) {
      return { posted: false, reason: "post_failed", code: err.code, message: err.message };
    }
    throw err;
  }
}
