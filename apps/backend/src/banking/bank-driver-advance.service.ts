// [HOLD-FOR-JORGE — TIER 1] BLOCK-6 — Driver loan/advance posting from bank categorize.
//
// CORE ACCOUNTING RULE (do not deviate): the Driver is a DIMENSION/TAG. The ACCOUNT chosen decides the
// treatment, NOT the tag:
//   • Driver tagged + the entity's Driver-Advance / Loan-to-Driver account (Other Current Asset) →
//     the offset posts as a DEBIT to that driver's receivable (a recoverable advance).
//   • Driver tagged + ANY other account (e.g. an expense) → the driver is analytics-only; it stays a
//     company expense; NO receivable is created.
// A fine the company simply eats must stay an expense — never force a loan from the tag alone.
//
// FLAG GATE: BANK_DRIVER_ADVANCE_ENABLED (lib.feature_flags, default OFF). With the flag OFF this is a
// strict NO-OP (returns { posted: false, reason: "flag_off" }) — zero JEs, zero driver_finance rows.
//
// REUSE, DO NOT FORK: the advance/receivable + settlement-recovery path is the EXISTING one —
//   createEmployeeLoanCore  → books driver_liabilities + deduction_schedule + driver_advances (so it
//                             flows into settlement recovery via the existing deduction machinery), then
//   disburseDriverAdvanceCore → posts the balanced JE via postSourceTransaction('driver_advance'):
//                             DEBIT the driver-advance receivable (QBO-149, resolved by the B1 category
//                             map), CREDIT the source bank account. NO new GL math is written here.
//
// FAIL-CLOSED: the "driver-advance account" for an entity is the account the driver_advance posting path
// authoritatively debits — resolveAccountForCategory(opco, "cash_advance", "cash_advance"). If that
// mapping is not designated for the entity we DO NOT post (reason: driver_advance_account_not_designated);
// we never guess an account.

import { withCompanyScope } from "../accounting/shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
} from "../accounting/expense-category-map/resolver.service.js";
import { createEmployeeLoanCore } from "../cash-advances/cash-advance-create.js";
import { disburseDriverAdvanceCore } from "../cash-advances/cash-advance-disburse.js";

export const BANK_DRIVER_ADVANCE_FLAG_KEY = "BANK_DRIVER_ADVANCE_ENABLED";

export type BankDriverAdvanceSkipReason =
  | "flag_off"
  | "no_driver"
  | "no_account"
  | "not_advance_account"
  | "driver_advance_account_not_designated"
  | "bank_txn_not_found"
  | "not_a_debit"
  | "zero_amount"
  | "authorization_required"
  | "disburse_failed";

export type BankDriverAdvanceResult =
  | { posted: false; reason: BankDriverAdvanceSkipReason; message?: string }
  | {
      posted: true;
      advance_id: string;
      liability_id: string;
      journal_entry_id: string;
      driver_advance_account_id: string;
      amount_cents: number;
    };

export type MaybePostBankDriverAdvanceInput = {
  companyId: string;
  actorUserUuid: string;
  actorRole: string;
  bankTransactionId: string;
  driverId: string | null | undefined;
  glAccountId: string | null | undefined;
  memo?: string | null;
  /**
   * Recovery cadence for the driver_finance.deduction_schedule the advance is enrolled in. Defaults to
   * a single period (recover at the next settlement); the net-pay floor + written-consent gates are
   * ENFORCED DOWNSTREAM by the FIN-18 settlement poster at recovery time — none of that math is invented
   * here. GUARD/owner re-amortizes as needed before the flag is ever flipped.
   */
  recovery?: { total_periods?: number; cadence?: "weekly" | "biweekly" };
};

type DecisionOk = {
  ok: true;
  driverAdvanceAccountId: string;
  amountCents: number;
  postingDate: string;
  creditAccountId: string | null;
};
type Decision = { ok: false; reason: BankDriverAdvanceSkipReason; message?: string } | DecisionOk;

/**
 * Read-only decision phase (inside one company-scoped transaction): checks the flag, verifies the tagged
 * Driver + that the chosen account IS the entity's driver-advance receivable account, and reads the bank
 * transaction (amount / date / direction / source bank-account COA). Returns a structured decision; never
 * writes.
 */
async function decide(input: MaybePostBankDriverAdvanceInput): Promise<Decision> {
  return withCompanyScope(input.actorUserUuid, input.companyId, async (client): Promise<Decision> => {
    const flagOn = await isEnabled(client, BANK_DRIVER_ADVANCE_FLAG_KEY, {
      operating_company_id: input.companyId,
      user_uuid: input.actorUserUuid,
    });
    if (!flagOn) return { ok: false, reason: "flag_off" };
    if (!input.driverId) return { ok: false, reason: "no_driver" };
    if (!input.glAccountId) return { ok: false, reason: "no_account" };

    // FAIL-CLOSED: authoritative driver-advance receivable account = the one the driver_advance posting
    // path debits (B1 category map). If it isn't designated we refuse to post.
    let driverAdvanceAccountId: string;
    try {
      const mapped = await resolveAccountForCategory(input.companyId, "cash_advance", "cash_advance");
      driverAdvanceAccountId = mapped.account_id;
    } catch (err) {
      if (err instanceof ExpenseCategoryMapResolutionError) {
        return { ok: false, reason: "driver_advance_account_not_designated", message: err.message };
      }
      throw err;
    }

    // THE decision: only the chosen account being the driver-advance account routes to a receivable.
    // Any other account (expense, etc.) → tag-only, stays an expense.
    if (input.glAccountId !== driverAdvanceAccountId) {
      return { ok: false, reason: "not_advance_account" };
    }

    const txnRes = await client.query(
      `
        SELECT
          bt.amount_cents::bigint AS amount_cents,
          bt.transaction_date::text AS transaction_date,
          bt.is_credit AS is_credit,
          ba.ledger_account_id::text AS bank_ledger_account_id
        FROM banking.bank_transactions bt
        LEFT JOIN banking.bank_accounts ba
          ON ba.id = bt.bank_account_id
          AND ba.operating_company_id = bt.operating_company_id
        WHERE bt.id = $1::uuid
          AND bt.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.bankTransactionId, input.companyId]
    );
    const txn = txnRes.rows[0] as
      | { amount_cents: string | number; transaction_date: string; is_credit: boolean; bank_ledger_account_id: string | null }
      | undefined;
    if (!txn) return { ok: false, reason: "bank_txn_not_found" };

    // An advance is money OUT (a debit on the bank). A credit (money in) is not a loan disbursement.
    if (txn.is_credit === true) return { ok: false, reason: "not_a_debit" };

    const amountCents = Math.abs(Number(txn.amount_cents ?? 0));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, reason: "zero_amount" };

    return {
      ok: true,
      driverAdvanceAccountId,
      amountCents,
      postingDate: txn.transaction_date,
      creditAccountId: txn.bank_ledger_account_id ?? null,
    };
  });
}

/**
 * BLOCK-6 entry point, called by the bank categorize route AFTER the tag has been persisted. Behind the
 * OFF-by-default BANK_DRIVER_ADVANCE_ENABLED flag. When (flag ON) + (a Driver is tagged) + (the chosen
 * account IS the entity's driver-advance receivable account), it enrolls + posts a recoverable driver
 * advance by REUSING the existing advance/settlement path — DEBIT the driver receivable, CREDIT the bank —
 * and attaches linked_bank_txn_id. In every other case it is a no-op returning a structured reason (the
 * driver tag itself was already saved by the route, so the expense/tag-only path is unchanged).
 *
 * Maker≠checker: the financial commit (disburse) reuses the existing Owner/Administrator back-dating gate
 * (disburseDriverAdvanceCore) — a caller without that role posting a back-dated advance is refused
 * (reason: authorization_required), leaving the tag in place.
 */
export async function maybePostBankDriverAdvanceForCategorization(
  input: MaybePostBankDriverAdvanceInput
): Promise<BankDriverAdvanceResult> {
  const decision = await decide(input);
  if (!decision.ok) return { posted: false, reason: decision.reason, message: decision.message };

  // Phase 1 — enroll the advance into the EXISTING recovery machinery (liability + deduction_schedule +
  // driver_advances). createEmployeeLoanCore must run inside a company-scoped transaction.
  const totalPeriods = Math.max(1, Math.trunc(input.recovery?.total_periods ?? 1));
  const cadence = input.recovery?.cadence ?? "weekly";
  const amountDollars = decision.amountCents / 100;

  const created = await withCompanyScope(input.actorUserUuid, input.companyId, (client) =>
    createEmployeeLoanCore(client, input.actorUserUuid, input.companyId, {
      driver_id: input.driverId as string,
      amount: amountDollars,
      purpose: "other",
      disbursement_method: "direct_bank_transfer",
      recipient_info: {
        recipient_type: "driver",
        recipient_name: input.memo ?? null,
        notes: `Bank-categorized driver advance (bank_txn ${input.bankTransactionId})`,
      },
      repayment_schedule: {
        weekly_installment_amount: amountDollars / totalPeriods,
        total_periods: totalPeriods,
        cadence,
      },
    })
  );
  if (!created.ok) {
    return { posted: false, reason: "disburse_failed", message: `${created.error}${created.message ? `: ${created.message}` : ""}` };
  }

  // Phase 2 — post the balanced JE via the EXISTING driver_advance source type: DEBIT driver-advance
  // receivable, CREDIT the source bank account (falls back to the company cash-like account when the bank
  // account has no linked COA register).
  const disb = await disburseDriverAdvanceCore(input.actorUserUuid, input.actorRole, input.companyId, {
    advance_id: created.advanceId,
    posting_date: decision.postingDate,
    credit_account_id: decision.creditAccountId,
  });
  if (!disb.ok) {
    if (disb.error === "owner_admin_only") return { posted: false, reason: "authorization_required" };
    return { posted: false, reason: "disburse_failed", message: `${disb.error}${disb.message ? `: ${disb.message}` : ""}` };
  }

  // Phase 3 — attach the source bank transaction to the advance (audit lineage; no financial effect).
  await withCompanyScope(input.actorUserUuid, input.companyId, async (client) => {
    await client.query(
      `
        UPDATE driver_finance.driver_advances
        SET linked_bank_txn_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid
      `,
      [input.bankTransactionId, created.advanceId, input.companyId]
    );
  });

  return {
    posted: true,
    advance_id: created.advanceId,
    liability_id: created.liabilityId,
    journal_entry_id: disb.posting?.journal_entry_id ?? "",
    driver_advance_account_id: decision.driverAdvanceAccountId,
    amount_cents: decision.amountCents,
  };
}
