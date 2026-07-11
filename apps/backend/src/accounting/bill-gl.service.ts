// P1-BILL-GL — the gated auto-post entrypoint for a Bill's internal GL.
// createBill() historically inserted accounting.bills but never posted the DR expense / CR ap_control
// journal entry, so the internal double-entry ledger was blind to A/P (the only bill→GL path was a
// separate Owner/Admin, TRANSP-only manual endpoint the UI never called). This wires the SAME canonical
// writer the manual endpoint + draft preview use (postSourceTransaction 'bill' → CHAIN-03 poster), gated
// per-entity by BILL_GL_POSTING_ENABLED. NO new GL math — reuse only. Idempotent (one posting batch per
// bill via the poster's idempotency key). Enforced wired by verify-bill-create-posts-gl.mjs.
//
// Unlike bill_payment, creating a Bill moves no cash, so flag-OFF does NOT block bill creation — the bill
// is still recorded and the return carries an explicit unposted status (never a silent success).

import { postSourceTransaction, PostingEngineError } from "./posting-engine.service.js";
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const BILL_GL_POSTING_FLAG_KEY = "BILL_GL_POSTING_ENABLED";

type PostingResult = Awaited<ReturnType<typeof postSourceTransaction>>;

export type BillGlPostOutcome =
  | { posted: false; reason: "posting_disabled" }
  | { posted: false; reason: "post_failed"; code: string; message: string }
  | { posted: true; result: PostingResult };

/**
 * Resolve BILL_GL_POSTING_ENABLED for an entity (user override first, then per-company override, then
 * default). Uses withCurrentUser + set_config (not withCompanyScope) — the caller (createBill) is already
 * authenticated and scoped, so this flag-read needs no membership re-assertion, and avoiding
 * withCompanyScope keeps the heavy company-membership/luciaPool dependency out of the createBill hot path.
 */
export async function isBillGlPostingEnabled(operatingCompanyId: string, userId: string): Promise<boolean> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return isEnabled(client, BILL_GL_POSTING_FLAG_KEY, {
      operating_company_id: operatingCompanyId,
      user_uuid: userId,
    });
  });
}

/**
 * Post a bill's balanced DR expense / CR ap_control JE if BILL_GL_POSTING_ENABLED is ON for the entity.
 * Flag OFF → `{posted:false, reason:"posting_disabled"}` (bill still stands, honest unposted status).
 * A PostingEngineError (e.g. unresolved account role) is surfaced as `post_failed` — NOT swallowed and
 * NOT allowed to roll back the already-committed bill; it is retriable via the manual /bills/:id/post-gl
 * endpoint (the poster is idempotent). Any other error propagates.
 */
export async function postBillGlIfEnabled(
  operatingCompanyId: string,
  billId: string,
  actor: { userId: string }
): Promise<BillGlPostOutcome> {
  const enabled = await isBillGlPostingEnabled(operatingCompanyId, actor.userId);
  if (!enabled) return { posted: false, reason: "posting_disabled" };

  try {
    const result = await postSourceTransaction(
      {
        operating_company_id: operatingCompanyId,
        source_transaction_type: "bill",
        source_transaction_id: billId,
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
