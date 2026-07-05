// [HOLD-FOR-JORGE — TIER 1] BLOCK-6b — Driver AUTO-DEDUCTION from a bank-categorized expense.
//
// THE CASE (distinct from BLOCK-6 bank-driver-advance): the company PAID an expense that BELONGS to a
// driver — the classic example is a FINE / toll / citation IH35 paid on the driver's behalf. The money
// already left the bank to a third party (a debit), so this is NOT a loan disbursement; it is a
// RECOVERABLE receivable the company collects out of the driver's next settlement. The owner wants that
// recovery created automatically when the transaction is categorized to a Driver AND flagged
// recover-from-driver.
//
// CORE RULE: the RECOVER-FROM-DRIVER flag decides recovery, the ACCOUNT decides GL treatment. A driver
// tagged on an ordinary expense with the flag OFF stays analytics-only (a company expense, no receivable) —
// identical to BLOCK-6. Only (flag ON) + (driver tagged) + (recover_from_driver=true) + (NOT the
// driver-advance account — that path is owned by bank-driver-advance.service.ts) creates a deduction.
//
// FLAG GATE: BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED (lib.feature_flags, default OFF). With the flag OFF this
// is a strict NO-OP (returns { posted: false, reason: "flag_off" }) — zero deduction rows, zero bucket
// charges. The driver/unit/load TAGS are already committed by the categorize route regardless.
//
// REUSE, DO NOT FORK (no new GL math): this routes the recovery through the EXISTING FIN-18 machinery —
//   getOrCreateBucket + chargeBucket  → the per-type driver_finance.driver_deduction_buckets ledger, then
//   createSettlementDeduction         → the canonical pending driver_settlement_deductions writer, carrying
//                                       load_id DIRECTLY (load↔advance load_id-direct rule), the bucket_id,
//                                       and source_bank_transaction_id for reverse drill-through.
// The FIN-18 settlement poster (settlement-posting.service.ts) then recovers each bucketed deduction
// generically (Cr `${deduction_type}_recovery`) at settlement time, PAY-FIRST-then-escrow, under the
// consent gate + net-pay floor. None of that math is invented here.
//
// CONSENT GATE (FLSA): a charge against a driver's pay requires a signed deduction authorization on file
// (hasSignedDeductionAuthorization). Missing → fail-closed (reason: "consent_missing"); the tags stay.

import { withCompanyScope } from "../accounting/shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
} from "../accounting/expense-category-map/resolver.service.js";
import { hasSignedDeductionAuthorization } from "../legal/signed-finance-handoff.service.js";
import { getOrCreateBucket, chargeBucket } from "../accounting/settlement-posting/bucket-ledger.service.js";
import { createSettlementDeduction, type SettlementDeductionSourceType } from "../driver-finance/deductions.service.js";

export const BANK_DRIVER_EXPENSE_DEDUCTION_FLAG_KEY = "BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED";

/** Recoverable-expense bucket types a bank-categorized driver expense can charge. Default = 'fine'. */
const ALLOWED_BUCKET_TYPES = new Set<SettlementDeductionSourceType>(["fine", "toll", "citation", "damage", "equipment", "fuel", "other"]);
const DEFAULT_BUCKET_TYPE: SettlementDeductionSourceType = "fine";

export type BankDriverExpenseDeductionSkipReason =
  | "flag_off"
  | "no_driver"
  | "not_recover_from_driver"
  | "driver_advance_branch"
  | "bank_txn_not_found"
  | "not_a_debit"
  | "zero_amount"
  | "consent_missing"
  | "create_failed";

export type BankDriverExpenseDeductionResult =
  | { posted: false; reason: BankDriverExpenseDeductionSkipReason; message?: string }
  | {
      posted: true;
      deduction_id: string;
      bucket_id: string;
      bucket_type: string;
      driver_id: string;
      load_id: string | null;
      amount_cents: number;
    };

export type MaybeCreateBankExpenseDeductionInput = {
  companyId: string;
  actorUserUuid: string;
  bankTransactionId: string;
  driverId: string | null | undefined;
  glAccountId: string | null | undefined;
  recoverFromDriver: boolean | null | undefined;
  /** Target bucket type (e.g. 'fine' | 'toll' | 'citation' | 'damage'). Defaults to 'fine'. */
  recoverDeductionType?: string | null;
  /** The trip/load the expense belongs to — persisted on the deduction DIRECTLY. */
  loadId?: string | null;
  memo?: string | null;
};

function normalizeBucketType(raw: string | null | undefined): SettlementDeductionSourceType {
  const t = (raw ?? "").trim().toLowerCase();
  if (t && ALLOWED_BUCKET_TYPES.has(t as SettlementDeductionSourceType)) return t as SettlementDeductionSourceType;
  return DEFAULT_BUCKET_TYPE;
}

/**
 * BLOCK-6b entry point, called by the bank categorize route AFTER the tags have been persisted and AFTER
 * the BLOCK-6 driver-advance path (which owns the driver-advance-account case). Behind the OFF-by-default
 * BANK_DRIVER_EXPENSE_DEDUCTION_ENABLED flag. Creates a bucket-charged, consent-gated, recoverable pending
 * deduction that flows into the FIN-18 settlement poster. Every non-posting outcome returns a structured
 * reason and leaves the committed tags untouched.
 */
export async function maybeCreateBankCategorizationDriverDeduction(
  input: MaybeCreateBankExpenseDeductionInput
): Promise<BankDriverExpenseDeductionResult> {
  return withCompanyScope(input.actorUserUuid, input.companyId, async (client): Promise<BankDriverExpenseDeductionResult> => {
    const flagOn = await isEnabled(client, BANK_DRIVER_EXPENSE_DEDUCTION_FLAG_KEY, {
      operating_company_id: input.companyId,
      user_uuid: input.actorUserUuid,
    });
    if (!flagOn) return { posted: false, reason: "flag_off" };
    if (!input.driverId) return { posted: false, reason: "no_driver" };
    if (!input.recoverFromDriver) return { posted: false, reason: "not_recover_from_driver" };

    // CEDE to the driver-advance path: if the chosen account IS the entity's driver-advance receivable
    // account, that is a loan disbursement (bank-driver-advance.service.ts owns it), NOT an expense
    // recovery. We must never double-book the same money. Fail-open here (a missing advance-account map is
    // not our concern — an expense recovery does not need it).
    if (input.glAccountId) {
      try {
        const advance = await resolveAccountForCategory(input.companyId, "cash_advance", "cash_advance");
        if (advance.account_id === input.glAccountId) {
          return { posted: false, reason: "driver_advance_branch" };
        }
      } catch (err) {
        if (!(err instanceof ExpenseCategoryMapResolutionError)) throw err;
        // advance account not designated → cannot be the advance branch → continue as an expense recovery.
      }
    }

    // Read the bank transaction: amount, direction, and the persisted load tag (fallback for the trip).
    const txnRes = await client.query(
      `
        SELECT bt.amount_cents::bigint AS amount_cents,
               bt.is_credit AS is_credit,
               bt.categorization_load_id::text AS categorization_load_id
        FROM banking.bank_transactions bt
        WHERE bt.id = $1::uuid AND bt.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.bankTransactionId, input.companyId]
    );
    const txn = txnRes.rows[0] as
      | { amount_cents: string | number; is_credit: boolean; categorization_load_id: string | null }
      | undefined;
    if (!txn) return { posted: false, reason: "bank_txn_not_found" };

    // A fine the company PAID is money OUT (a debit). A credit (money in) is not a recoverable payment.
    if (txn.is_credit === true) return { posted: false, reason: "not_a_debit" };
    const amountCents = Math.abs(Number(txn.amount_cents ?? 0));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return { posted: false, reason: "zero_amount" };

    // CONSENT GATE (FLSA) — a charge against the driver's pay requires a signed authorization on file.
    const consented = await hasSignedDeductionAuthorization(client as never, {
      operatingCompanyId: input.companyId,
      driverId: input.driverId,
    });
    if (!consented) return { posted: false, reason: "consent_missing" };

    const bucketType = normalizeBucketType(input.recoverDeductionType);
    const loadId = input.loadId ?? txn.categorization_load_id ?? null;
    const reason = `Bank-categorized driver ${bucketType} recovery (bank_txn ${input.bankTransactionId})${
      input.memo ? `: ${input.memo}` : ""
    }`;

    // 1) Bucket ledger (reuse) — get-or-create the per-type bucket, then CHARGE it (increases obligation).
    const bucket = await getOrCreateBucket(client as never, {
      operatingCompanyId: input.companyId,
      driverId: input.driverId,
      bucketType,
      actorUserId: input.actorUserUuid,
    });
    await chargeBucket(client as never, {
      operatingCompanyId: input.companyId,
      bucket,
      amountCents,
      sourceExpenseId: null,
      reason,
      actorUserId: input.actorUserUuid,
    });

    // 2) Pending deduction (reuse the ONE canonical writer) — bucket-charged, load_id DIRECT, bank-txn
    //    provenance. Seeds the recovery; the FIN-18 poster draws it at settlement time.
    let deductionId: string;
    try {
      const deduction = await createSettlementDeduction(client, {
        driverId: input.driverId,
        operatingCompanyId: input.companyId,
        amountCents,
        reason,
        sourceType: bucketType,
        loadId,
        bucketId: bucket.id,
        sourceBankTransactionId: input.bankTransactionId,
        createdByUserId: input.actorUserUuid,
      });
      deductionId = deduction.id;
    } catch (err) {
      return { posted: false, reason: "create_failed", message: String((err as Error)?.message ?? err) };
    }

    // 3) Reverse link on the bank transaction (bank txn → the deduction it created).
    await client.query(
      `
        UPDATE banking.bank_transactions
        SET categorization_deduction_id = $1::uuid, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid
      `,
      [deductionId, input.bankTransactionId, input.companyId]
    );

    return {
      posted: true,
      deduction_id: deductionId,
      bucket_id: bucket.id,
      bucket_type: bucketType,
      driver_id: input.driverId,
      load_id: loadId,
      amount_cents: amountCents,
    };
  });
}
