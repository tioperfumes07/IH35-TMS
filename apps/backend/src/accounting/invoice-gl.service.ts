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

import { postSourceTransaction, PostingEngineError } from "./posting-engine.service.js";
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const INVOICE_AR_GL_POSTING_FLAG_KEY = "INVOICE_AR_GL_POSTING_ENABLED";

type PostingResult = Awaited<ReturnType<typeof postSourceTransaction>>;

export type InvoiceGlPostOutcome =
  | { posted: false; reason: "posting_disabled" }
  | { posted: false; reason: "post_failed"; code: string; message: string }
  | { posted: true; result: PostingResult };

/**
 * Resolve INVOICE_AR_GL_POSTING_ENABLED for an entity (user override, then per-company override, then
 * default). Mirrors isBillGlPostingEnabled: withCurrentUser + set_config rather than withCompanyScope,
 * because the caller is already authenticated and entity-scoped and this flag read needs no membership
 * re-assertion.
 */
export async function isInvoiceGlPostingEnabled(operatingCompanyId: string, userId: string): Promise<boolean> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, INVOICE_AR_GL_POSTING_FLAG_KEY, {
      operating_company_id: operatingCompanyId,
      user_uuid: userId,
    });
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
  operatingCompanyId: string,
  invoiceId: string,
  actor: { userId: string }
): Promise<InvoiceGlPostOutcome> {
  const enabled = await isInvoiceGlPostingEnabled(operatingCompanyId, actor.userId);
  if (!enabled) return { posted: false, reason: "posting_disabled" };

  try {
    const result = await postSourceTransaction(
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
