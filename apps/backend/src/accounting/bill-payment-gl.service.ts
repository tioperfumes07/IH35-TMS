// CHAIN-04 — flag-gated bill-payment -> GL posting entrypoint.
//
// The bill-payment poster (buildBillPaymentLines in posting-engine.service.ts) does the GL math
// (DR ap_control / CR real bank). THIS module is the per-entity kill-switch in front of it: it
// resolves BILL_PAYMENT_GL_POSTING_ENABLED via isEnabled() (lib.feature_flags + per-company
// overrides, resolved IN-HANDLER — never a global process.env read) and NO-OPs when the flag is OFF
// for the entity. Default OFF (migration 202607011100). Mirrors CHAIN-03's BILL_GL_POSTING_ENABLED
// gate (bill-gl-draft.routes.ts). No new GL math is introduced here. Tier-1 financial — build-and-hold.

import { withCompanyScope } from "./shared.js";
import { postSourceTransaction } from "./posting-engine.service.js";

export const BILL_PAYMENT_GL_POSTING_FLAG_KEY = "BILL_PAYMENT_GL_POSTING_ENABLED";

type PostingResult = Awaited<ReturnType<typeof postSourceTransaction>>;

export type BillPaymentGlPostOutcome =
  | { posted: false; reason: "posting_disabled" }
  | { posted: true; result: PostingResult };

// Local import kept lazy-free: isEnabled is the shared per-entity flag resolver.
import { isEnabled } from "../lib/feature-flags/service.js";

/**
 * Resolve BILL_PAYMENT_GL_POSTING_ENABLED for an entity (user override first, then per-company
 * override, else the registered default = OFF). Used by the route gate and by callers that want to
 * decide before touching the engine.
 */
export async function isBillPaymentGlPostingEnabled(
  operatingCompanyId: string,
  userId: string
): Promise<boolean> {
  return withCompanyScope(userId, operatingCompanyId, (client) =>
    isEnabled(client, BILL_PAYMENT_GL_POSTING_FLAG_KEY, {
      operating_company_id: operatingCompanyId,
      user_uuid: userId,
    })
  );
}

/**
 * The gated posting entrypoint. When the flag is OFF for the entity, returns a NO-OP outcome and
 * writes NOTHING to the ledger. When ON, posts the balanced DR ap_control / CR real-bank JE via the
 * shared posting engine (which itself enforces the bill-posted-first guard, fail-closed account
 * resolution, idempotency, the balance trigger, and the closed-period gate).
 */
export async function postBillPaymentGlIfEnabled(
  operatingCompanyId: string,
  billPaymentId: string,
  actor: { userId: string }
): Promise<BillPaymentGlPostOutcome> {
  const enabled = await isBillPaymentGlPostingEnabled(operatingCompanyId, actor.userId);
  if (!enabled) return { posted: false, reason: "posting_disabled" };

  const result = await postSourceTransaction(
    {
      operating_company_id: operatingCompanyId,
      source_transaction_type: "bill_payment",
      source_transaction_id: billPaymentId,
    },
    { userId: actor.userId }
  );
  return { posted: true, result };
}
