// VOID-DOCUMENT-CALLEES (Lead, 2026-09-23, Round 35.3) — "invert the dependency": instead of
// deductions.routes.ts / settlements.routes.ts waiting on CC-1's voidDocument() dispatcher to
// exist, driver-finance/** (this lane) exports the two functions that dispatcher will call for
// type='settlement' and type='deduction'. CC-1 imports and calls these; the delta is his to
// reconcile if his own signature differs slightly, per his own instruction.
//
// Both functions are thin wrappers over ALREADY-EXISTING, ALREADY-CORRECT engines — no new GL
// math, no new posting logic, no reimplemented preconditions:
//
//   reverseSettlementForVoid -> reverseSettlementBillPaymentInClientTx
//     (settlement-bill-payment-posting.service.ts:914), the SAME engine
//     POST /settlements/:id/reverse already calls. Keeps that route's exact preconditions
//     (refuses 'paid' -- needs a real clawback, not a reversal; refuses a still-locked
//     settlement -- unlock first) and its exact cascade (settlement_lines deactivated +
//     voided/reason/actor stamped, settlement status -> 'cancelled', any
//     paid_via_bank_txn_id match reset via the same unmatchBankTransactionById primitive,
//     audited). This is the SAME logic, extracted so both callers (the existing route and
//     CC-1's dispatcher) share ONE implementation rather than two copies drifting apart --
//     the route below is refactored to call this function too.
//
//   reverseDeductionForVoid -> voidSettlementDeduction (settlement-deduction-void.service.ts),
//     the owner-ruled (2026-09-05 19:44Z, "why would I forgive the debt") THREE-BRANCH dispatch.
//     An already-collected ('applied') deduction is NEVER reversed -- record-only void, the
//     driver is never credited back. Untouched here; this function only adapts the call/return
//     shape to voidDocument()'s ruled {voidedAt, reversalJournalEntryId} contract.
//
// operatingCompanyId is an explicit, required parameter on both functions (not in the Lead's
// abbreviated inline signature) -- every real function in this codebase requires it explicitly
// rather than trusting RLS GUC state alone for a WHERE clause, and CC-1's dispatcher already has
// it from its own caller (the same withCompanyScope context every voidDocument() call runs
// inside). Not a guess: matches every other function this file's own two engines already require.
import {
  reverseSettlementBillPaymentInClientTx,
  type SettlementBillPaymentReversalResult,
} from "../accounting/settlement-posting/settlement-bill-payment-posting.service.js";
import { unmatchBankTransactionById } from "../accounting/void.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { voidSettlementDeduction, DeductionVoidError } from "./settlement-deduction-void.service.js";
import { completeDriverSettlementVoidCascadeInClientTx } from "./driver-settlement-void-cascade.service.js";
import { stampSettlementVoidedInClientTx } from "./settlement-void-state.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export class SettlementVoidBlockedError extends Error {
  constructor(readonly code: "settlement_not_found" | "settlement_already_cancelled" | "settlement_reverse_blocked_paid" | "settlement_reverse_blocked_locked") {
    super(code);
    this.name = "SettlementVoidBlockedError";
  }
}

export type ReverseSettlementForVoidResult = {
  voidedAt: string;
  reversalJournalEntryId: string | null;
  glReversalResult: SettlementBillPaymentReversalResult["result"];
  bankTransactionUnmatched: boolean;
  /** ROUND 300 — the pay-run sub-ledger unwind, when the settlement was posted through the per-load A/P chain. */
  payrunUnwind?: { run_id: string; advances_restored: number; escrow_reversed_cents: number } | null;
  /** LEAD 443.192 — what the shared void cascade released from the dead settlement (ids also in the reversed audit). */
  settlementLinesVoided: string[];
  driverBillsReleased: string[];
  reimbursementsReleased: string[];
  /** LEAD 443.193 — nothing_to_reverse only: pending deductions released from the cancelled settlement / linked ones left untouched. */
  deductionsReleased: string[];
  deductionsRetained: string[];
  /** 443.210R — loads freed from presettlement_link_id (can join a new settlement). */
  loadsReleased?: string[];
  /** 443.210R — company settlements voided alongside (void-not-delete). */
  companySettlementsVoided?: string[];
};

/**
 * voidDocument()'s type='settlement' callee. Refuses (throws SettlementVoidBlockedError) exactly
 * where POST /settlements/:id/reverse already refuses -- 'paid' (needs a real clawback) and a
 * still-locked settlement (unlock first) -- never silently bypassing either. On success: reverses
 * every linked bill/bill_payment/deduction JE via the shared engine, deactivates + voids this
 * settlement's own settlement_lines with the SAME reason/actor/timestamp, flips status to
 * 'cancelled', resets any bank-transaction match, and audits -- identical to the route's own
 * cascade, because this function now backs that route too (see the /reverse handler below).
 */
export async function reverseSettlementForVoid(
  client: Queryable,
  input: { operatingCompanyId: string; settlementId: string; reason: string; actor: { userId: string } }
): Promise<ReverseSettlementForVoidResult> {
  const { operatingCompanyId, settlementId, reason, actor } = input;

  const currentRes = await client.query<{ id: string; status: string; locked_at: string | null; paid_via_bank_txn_id: string | null }>(
    `SELECT id::text, status::text, locked_at::text, paid_via_bank_txn_id::text
       FROM driver_finance.driver_settlements
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1 FOR UPDATE`,
    [settlementId, operatingCompanyId]
  );
  const current = currentRes.rows[0];
  if (!current) throw new SettlementVoidBlockedError("settlement_not_found");
  if (current.status === "cancelled") throw new SettlementVoidBlockedError("settlement_already_cancelled");
  if (current.status === "paid") throw new SettlementVoidBlockedError("settlement_reverse_blocked_paid");
  if (current.locked_at) throw new SettlementVoidBlockedError("settlement_reverse_blocked_locked");

  const currentBusinessDate = companyBusinessDate();
  const reversal = await reverseSettlementBillPaymentInClientTx(
    client,
    { operatingCompanyId, settlementId, reason },
    { userId: actor.userId },
    currentBusinessDate
  );

  // LEAD 443.192 (13:25Z follow-up) — the SAME cascade executeVoidCancel('driver_settlement') runs (replaces the inline
  // settlement_lines UPDATE that used to sit here — identical SQL, now in one place, so nothing is applied twice). Before,
  // this path (Settlement Creator Edit = void and repost; POST /settlements/:id/reverse) voided the lines but left every
  // OPEN driver bill and every unpaid reimbursement still pointing at the cancelled settlement (measured: P-0085 1 open
  // bill + 2 reimbursements, P-0092 2 reimbursements), so the repost / the next settlement could never pick them up —
  // the materialize + computeSettlementReimbursements writers select settlement_line_id / applied_to_settlement_id IS
  // NULL, and the bill writers settled_in_settlement_id IS NULL. voidChildren:false — deductions on this path go only
  // through the owner-ruled deduction engine (Creator: reverseDeductionForVoid before this call) or are restored to
  // pending by the GL reversal above; a raw voided_at stamp would forgive an uncollected deduction.
  const cascade = await completeDriverSettlementVoidCascadeInClientTx(client, {
    operatingCompanyId,
    settlementId,
    userId: actor.userId,
    reason,
    // LEAD 443.193 (Lead 14:05Z (b)) — /reverse with nothing to reverse releases the settlement's pending deductions
    // through the cascade's step 5 (the SAME restore the GL reversal runs when it did reverse a run).
    glReversalResult: reversal.result,
    voidChildren: false,
  });

  // R-102-B (2026-09-23) — mirror both void-marker sets (same fix as governance/void-cancel-
  // executors.ts's identical path); see that file's comment for the live-measured root cause.
  // stampSettlementVoidedInClientTx runs the canonical 7-column dead-state writer — equivalent to:
  //   SET status = 'cancelled', reversed_at = now(), reversed_by_user_id = actor.userId,
  //       reversal_reason = reason, voided_at = COALESCE(...), ... (settlement-void-state.service.ts)
  const flipped = await stampSettlementVoidedInClientTx(client, {
    settlementId, operatingCompanyId, userId: actor.userId, reason,
  });

  let bankTransactionUnmatched = false;
  if (current.paid_via_bank_txn_id) {
    bankTransactionUnmatched = await unmatchBankTransactionById(client, operatingCompanyId, current.paid_via_bank_txn_id, {
      userId: actor.userId,
      reason: `settlement reversal: ${settlementId}`,
    });
    await client.query(`UPDATE driver_finance.driver_settlements SET paid_via_bank_txn_id = NULL WHERE id = $1::uuid`, [settlementId]);
  }

  // The engine reverses possibly-several JEs (per bill/bill_payment/deduction); voidDocument()'s
  // contract wants ONE reversalJournalEntryId. The settlement's own GL run header
  // (deduction_journal_entry_id) is the closest singular concept -- if it was posted, its
  // reversed_by_je_id (the reversing entry reverseSettlementBillPaymentInClientTx just created
  // for it) is the answer; null when there was nothing to reverse or no header deduction JE
  // existed. Reuses the reversed_by_je_id linkage this session's own void-not-delete pattern
  // relies on everywhere else -- never a second, competing "which JE is THE reversal" answer.
  let reversalJournalEntryId: string | null = null;
  if (reversal.result === "reversed") {
    const runRes = await client.query<{ deduction_journal_entry_id: string | null }>(
      `SELECT deduction_journal_entry_id::text FROM driver_finance.driver_settlement_gl_runs WHERE id = $1::uuid`,
      [reversal.run_id]
    );
    const originalJeId = runRes.rows[0]?.deduction_journal_entry_id ?? null;
    if (originalJeId) {
      const jeRes = await client.query<{ reversed_by_je_id: string | null }>(
        `SELECT reversed_by_je_id::text FROM accounting.journal_entries WHERE id = $1::uuid`,
        [originalJeId]
      );
      reversalJournalEntryId = jeRes.rows[0]?.reversed_by_je_id ?? null;
    }
  }

  await appendCrudAudit(
    client,
    actor.userId,
    "driver_finance.driver_settlement.reversed",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: settlementId,
      operating_company_id: operatingCompanyId,
      reason,
      before_status: current.status,
      after_status: "cancelled",
      gl_reversal_result: reversal.result,
      gl_run_id: reversal.run_id,
      bank_transaction_unmatched: bankTransactionUnmatched,
      settlement_lines_voided: cascade.lines_voided,
      driver_bills_released: cascade.driver_bills_released,
      reimbursements_released: cascade.reimbursements_released,
      deductions_released: cascade.deductions_released,
      deductions_retained: cascade.deductions_retained,
      trip_closed: cascade.trip_closed,
      loads_released: cascade.loads_released,
      company_settlements_voided: cascade.company_settlements_voided,
      via: "voidDocument.reverseSettlementForVoid",
    },
    "warning",
    "SETL-NO-VOID-PATH-01"
  );

  return {
    voidedAt: flipped.voidedAt,
    reversalJournalEntryId,
    payrunUnwind: reversal.payrun_unwind ?? null,
    glReversalResult: reversal.result,
    bankTransactionUnmatched,
    settlementLinesVoided: cascade.lines_voided,
    driverBillsReleased: cascade.driver_bills_released,
    reimbursementsReleased: cascade.reimbursements_released,
    deductionsReleased: cascade.deductions_released,
    deductionsRetained: cascade.deductions_retained,
    loadsReleased: cascade.loads_released,
    companySettlementsVoided: cascade.company_settlements_voided,
  };
}

export type ReverseDeductionForVoidResult = {
  voidedAt: string;
  reversalJournalEntryId: string | null;
  outcome: "voided_pending" | "voided_partial_remainder" | "voided_applied_retained";
};

/**
 * voidDocument()'s type='deduction' callee. Delegates verbatim to voidSettlementDeduction() --
 * the owner-ruled three-branch dispatch (pending/partial/applied). An APPLIED (fully-collected)
 * deduction is NEVER reversed: reversalJournalEntryId comes back null for that branch by design
 * (voidSettlementDeduction's own journal_entry_id is always null -- it posts no reversing JE on
 * any branch, per the 2026-09-05 owner ruling). Rethrows DeductionVoidError as-is so the caller's
 * own error-code handling (404/409/422, already wired in deductions.routes.ts) keeps working
 * unchanged.
 */
export async function reverseDeductionForVoid(
  client: Queryable,
  input: { operatingCompanyId: string; deductionId: string; reason: string; actor: { userId: string } }
): Promise<ReverseDeductionForVoidResult> {
  const result = await voidSettlementDeduction(client, {
    operating_company_id: input.operatingCompanyId,
    deduction_id: input.deductionId,
    reason: input.reason,
    actor_user_id: input.actor.userId,
  });

  const row = await client.query<{ voided_at: string }>(
    `SELECT voided_at::text FROM driver_finance.driver_settlement_deductions WHERE id = $1::uuid`,
    [result.id]
  );

  return {
    voidedAt: row.rows[0]!.voided_at,
    reversalJournalEntryId: result.journal_entry_id,
    outcome: result.outcome,
  };
}

export { DeductionVoidError };
