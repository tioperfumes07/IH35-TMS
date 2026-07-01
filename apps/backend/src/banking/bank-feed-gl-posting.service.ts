// [HOLD-FOR-JORGE — TIER 1] BLOCK-03 / CHAIN-05 — Bank-feed categorization → GL posting (GAP-CLOSURE).
//
// GENERALIZES the built BLOCK-6 special case (bank-driver-advance.service.ts) to ALL categorized bank
// transactions. When an operator categorizes a bank-feed line the route tags the row + mirrors to QBO, but
// the internal double-entry ledger never moves (the CHAIN-05 gap). This service closes it by REUSING the
// existing posting engine (postSourceTransaction 'bank_categorization') — NO new GL math is written here.
//
// DIRECTION IS DRIVEN ONLY BY is_credit, NEVER by the sign of amount_cents (money-out is stored NEGATIVE;
// the posting engine posts Math.abs). The account TYPE the operator chose decides the economic meaning:
//   • is_credit=false (money OUT): DR categorized account (expense/asset/liability) / CR bank ledger.
//   • is_credit=true  (money IN):  DR bank ledger / CR categorized account (income/liability/contra).
//
// FLAG GATE: BANK_FEED_GL_POSTING_ENABLED (lib.feature_flags, per-entity override, DEFAULT OFF). With the
// flag OFF this is a strict NO-OP (returns { posted:false, reason:"flag_off" }) — zero JEs. The categorize
// tag is already committed by the route, so a non-posting outcome never loses it.
//
// DOUBLE-POST INTERLOCKS (mandatory — this service must never post a row another chain owns):
//   1. CEDE the driver-advance branch to BLOCK-6: when a Driver is tagged AND the chosen account IS the
//      entity's driver-advance receivable (resolveAccountForCategory 'cash_advance'), return
//      driver_advance_branch and post NOTHING — BANK_DRIVER_ADVANCE_ENABLED owns that row.
//   2. SKIP rows already matched to a bill (matched_bill_id) — CHAIN-03/04 sourced them (Match, not
//      Categorize) → reason already_matched_to_bill.
//   3. SKIP own-bank transfers (transfer_kind / destination_bank_account_id / review_state='transfer') —
//      bank-to-bank has no P&L → reason is_transfer.
// FAIL-CLOSED on any unresolved / cross-entity / non-postable account, missing bank ledger bridge, or a
// zero amount. Idempotent: a row already stamped matched_journal_entry_id returns already_posted.

import { withCompanyScope } from "../accounting/shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
} from "../accounting/expense-category-map/resolver.service.js";
import { postSourceTransaction } from "../accounting/posting-engine.service.js";

export const BANK_FEED_GL_POSTING_FLAG_KEY = "BANK_FEED_GL_POSTING_ENABLED";

export type BankFeedGlSkipReason =
  | "flag_off"
  | "bank_txn_not_found"
  | "not_categorized"
  | "already_posted"
  | "already_matched_to_bill"
  | "is_transfer"
  | "no_account"
  | "driver_advance_branch"
  | "account_cross_entity"
  | "account_not_postable"
  | "bank_account_ledger_unlinked"
  | "zero_amount"
  | "post_failed";

export type BankFeedGlResult =
  | { posted: false; reason: BankFeedGlSkipReason; message?: string }
  | {
      posted: true;
      journal_entry_id: string;
      posting_batch_id: string;
      direction: "money_in" | "money_out";
      categorized_account_id: string;
      bank_ledger_account_id: string;
      amount_cents: number;
      already_posted: boolean;
    };

export type MaybePostBankCategorizationInput = {
  companyId: string;
  actorUserUuid: string;
  bankTransactionId: string;
};

type DecisionOk = {
  ok: true;
  direction: "money_in" | "money_out";
  categorizedAccountId: string;
  bankLedgerAccountId: string;
  amountCents: number;
};
type Decision = { ok: false; reason: BankFeedGlSkipReason; message?: string } | DecisionOk;

/**
 * Read-only decision phase (inside one company-scoped transaction): checks the flag, reads the bank
 * transaction + its bank-account cash-GL bridge + the chosen account's validity, applies the three
 * double-post interlocks, and derives direction from the is_credit flag. Never writes.
 */
async function decide(input: MaybePostBankCategorizationInput): Promise<Decision> {
  return withCompanyScope(input.actorUserUuid, input.companyId, async (client): Promise<Decision> => {
    const flagOn = await isEnabled(client, BANK_FEED_GL_POSTING_FLAG_KEY, {
      operating_company_id: input.companyId,
      user_uuid: input.actorUserUuid,
    });
    if (!flagOn) return { ok: false, reason: "flag_off" };

    const txnRes = await client.query(
      `
        SELECT
          bt.status::text                              AS status,
          bt.review_state::text                        AS review_state,
          bt.is_credit                                 AS is_credit,
          bt.amount_cents::bigint                      AS amount_cents,
          bt.categorization_gl_account_id::text        AS categorization_gl_account_id,
          bt.categorization_driver_id::text            AS categorization_driver_id,
          bt.matched_bill_id::text                     AS matched_bill_id,
          bt.matched_journal_entry_id::text            AS matched_journal_entry_id,
          bt.transfer_kind::text                       AS transfer_kind,
          bt.destination_bank_account_id::text         AS destination_bank_account_id,
          ba.ledger_account_id::text                   AS bank_ledger_account_id,
          ca.id::text                                  AS cat_account_id,
          ca.operating_company_id::text                AS cat_account_opco,
          ca.deactivated_at                            AS cat_account_deactivated_at,
          ca.is_postable                               AS cat_account_is_postable
        FROM banking.bank_transactions bt
        LEFT JOIN banking.bank_accounts ba
          ON ba.id = bt.bank_account_id
          AND ba.operating_company_id = bt.operating_company_id
        LEFT JOIN catalogs.accounts ca
          ON ca.id = bt.categorization_gl_account_id
        WHERE bt.id = $1::uuid
          AND bt.operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.bankTransactionId, input.companyId]
    );
    const txn = txnRes.rows[0] as
      | {
          status: string | null;
          review_state: string | null;
          is_credit: boolean;
          amount_cents: string | number | null;
          categorization_gl_account_id: string | null;
          categorization_driver_id: string | null;
          matched_bill_id: string | null;
          matched_journal_entry_id: string | null;
          transfer_kind: string | null;
          destination_bank_account_id: string | null;
          bank_ledger_account_id: string | null;
          cat_account_id: string | null;
          cat_account_opco: string | null;
          cat_account_deactivated_at: string | null;
          cat_account_is_postable: boolean | null;
        }
      | undefined;
    if (!txn) return { ok: false, reason: "bank_txn_not_found" };

    // Only a categorized line posts (a transfer/excluded/for-review line is not a Categorize action).
    if (txn.status !== "categorized") return { ok: false, reason: "not_categorized" };

    // Idempotency: a row already carrying a CHAIN-05 JE never re-posts.
    if (txn.matched_journal_entry_id) return { ok: false, reason: "already_posted" };

    // Interlock 2 — matched to a bill (CHAIN-03/04 sourced it; Match, not Categorize).
    if (txn.matched_bill_id) return { ok: false, reason: "already_matched_to_bill" };

    // Interlock 3 — own-bank transfer (no P&L).
    if (txn.transfer_kind || txn.destination_bank_account_id || txn.review_state === "transfer") {
      return { ok: false, reason: "is_transfer" };
    }

    const categorizedAccountId = txn.categorization_gl_account_id;
    if (!categorizedAccountId) return { ok: false, reason: "no_account" };

    // Interlock 1 — CEDE the driver-advance branch to BLOCK-6. Only when a Driver is tagged AND the chosen
    // account IS the entity's driver-advance receivable. If no such mapping is designated for the entity,
    // there is nothing to cede → an ordinary expense/asset categorization proceeds here.
    if (txn.categorization_driver_id) {
      let driverAdvanceAccountId: string | null = null;
      try {
        const mapped = await resolveAccountForCategory(input.companyId, "cash_advance", "cash_advance");
        driverAdvanceAccountId = mapped.account_id;
      } catch (err) {
        if (!(err instanceof ExpenseCategoryMapResolutionError)) throw err;
        driverAdvanceAccountId = null; // undesignated → cannot be the advance account → no cede
      }
      if (driverAdvanceAccountId && categorizedAccountId === driverAdvanceAccountId) {
        return { ok: false, reason: "driver_advance_branch" };
      }
    }

    // Fail-closed account validation: same entity, active, postable.
    if (!txn.cat_account_id || (txn.cat_account_opco && txn.cat_account_opco !== input.companyId)) {
      return { ok: false, reason: "account_cross_entity" };
    }
    if (txn.cat_account_deactivated_at || txn.cat_account_is_postable !== true) {
      return { ok: false, reason: "account_not_postable" };
    }

    // Fail-closed bank cash-GL bridge (the direction-appropriate bank leg).
    if (!txn.bank_ledger_account_id) return { ok: false, reason: "bank_account_ledger_unlinked" };

    // Sign landmine: money-out is stored NEGATIVE. Magnitude only; direction from the is_credit flag.
    const amountCents = Math.abs(Number(txn.amount_cents ?? 0));
    if (!Number.isFinite(amountCents) || amountCents <= 0) return { ok: false, reason: "zero_amount" };

    return {
      ok: true,
      direction: txn.is_credit === true ? "money_in" : "money_out",
      categorizedAccountId,
      bankLedgerAccountId: txn.bank_ledger_account_id,
      amountCents,
    };
  });
}

/**
 * CHAIN-05 entry point — called by the bank categorize route AFTER the tag has been persisted, behind the
 * OFF-by-default BANK_FEED_GL_POSTING_ENABLED flag. When (flag ON) + (a valid, non-ceded, non-transfer,
 * unmatched categorized line), it posts the direction-aware balanced JE via the EXISTING posting engine and
 * stamps the durable back-pointer (matched_journal_entry_id + reviewed_at + review_state='matched'). In
 * every other case it is a NO-OP returning a structured reason (the tag itself is unaffected).
 */
export async function maybePostBankCategorizationToGl(input: MaybePostBankCategorizationInput): Promise<BankFeedGlResult> {
  const decision = await decide(input);
  if (!decision.ok) return { posted: false, reason: decision.reason, message: decision.message };

  // Post via the single canonical writer. The engine re-reads the row inside its own tx, derives the same
  // direction, enforces the closed-period gate + assertBalanced + idempotency (posting_batches unique key).
  let posted;
  try {
    posted = await postSourceTransaction(
      {
        operating_company_id: input.companyId,
        source_transaction_type: "bank_categorization",
        source_transaction_id: input.bankTransactionId,
        posting_purpose: "initial_post",
      },
      { userId: input.actorUserUuid }
    );
  } catch (err) {
    return { posted: false, reason: "post_failed", message: String((err as Error)?.message ?? err) };
  }

  // Durable back-pointer + idempotency stamp (atomic, company-scoped). Guard on the null back-pointer so a
  // race can only stamp once. NOTE: review_state='matched' (a valid CHECK value) — the block spec's
  // 'cleared' is NOT in the review_state CHECK constraint; 'matched' is the closest valid analog (the line
  // is now linked to a journal entry). Flagged as a spec/schema drift in the PR body.
  await withCompanyScope(input.actorUserUuid, input.companyId, async (client) => {
    await client.query(
      `
        UPDATE banking.bank_transactions
        SET matched_journal_entry_id = $1::uuid,
            review_state = 'matched',
            reviewed_at = now(),
            updated_at = now()
        WHERE id = $2::uuid
          AND operating_company_id = $3::uuid
          AND matched_journal_entry_id IS NULL
      `,
      [posted.journal_entry_id, input.bankTransactionId, input.companyId]
    );
  });

  return {
    posted: true,
    journal_entry_id: posted.journal_entry_id,
    posting_batch_id: posted.posting_batch_id,
    direction: decision.direction,
    categorized_account_id: decision.categorizedAccountId,
    bank_ledger_account_id: decision.bankLedgerAccountId,
    amount_cents: decision.amountCents,
    already_posted: posted.result === "already_posted",
  };
}
