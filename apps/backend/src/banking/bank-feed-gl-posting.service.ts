// [HOLD-FOR-JORGE — TIER 1] BLOCK-03 / CHAIN-05 — Bank-feed categorization → GL posting (GAP-CLOSURE).
//
// GENERALIZES the built BLOCK-6 special case (bank-driver-advance.service.ts) to ALL categorized bank
// transactions. When an operator categorizes a bank-feed line the route tags the row + mirrors to QBO, but
// the internal double-entry ledger never moves (the CHAIN-05 gap). This service closes it by REUSING the
// existing posting engine (postSourceTransaction 'bank_categorization') — NO new GL math is written here.
//
// DIRECTION IS DRIVEN ONLY BY is_credit, NEVER by the sign of amount_cents — the posting engine posts
// Math.abs, so the sign doesn't matter to this file either way, but for the next reader: LV-BANK-SIGN-
// COMMENT-IS-INVERTED (2026-08-16) — live-measured on prod, the stored sign is the OPPOSITE of what this
// comment used to claim. is_credit=false (money OUT) rows are 100% POSITIVE; is_credit=true (money IN)
// rows are mostly NEGATIVE (2,687 of 2,795), with a single documented exception (108 Relay Fuel Wallet
// rows, positive by that integration's own convention). The account TYPE the operator chose still decides
// the economic meaning:
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
//   3. SKIP own-bank transfers (transfer_kind / destination_bank_account_id / review_state='transfer' /
//      matched_transfer_id) — bank-to-bank has no P&L → reason is_transfer. matched_transfer_id is the
//      SAME dedupe key transfers.service.ts's own createTransfer/acceptMatchWithResolveDifference (bank-
//      recon match.service.ts) stamps when a Plaid-synced feed line is matched to an internal
//      banking.transfers row — a line already linked to a transfer must never ALSO post through
//      categorization (that would double-count the cash movement: once via the transfer's own JE, once
//      via this poster).
// FAIL-CLOSED on any unresolved / cross-entity / non-postable account, missing bank ledger bridge, or a
// zero amount. Idempotent: a row already stamped matched_journal_entry_id returns already_posted.

import { withCompanyScope } from "../accounting/shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import {
  resolveAccountForCategory,
  ExpenseCategoryMapResolutionError,
} from "../accounting/expense-category-map/resolver.service.js";
import { postSourceTransaction } from "../accounting/posting-engine.service.js";
import { isBankAccountHideEnabled } from "./bank-account-visibility.js";

export const BANK_FEED_GL_POSTING_FLAG_KEY = "BANK_FEED_GL_POSTING_ENABLED";

export type BankFeedGlSkipReason =
  | "flag_off"
  | "bank_txn_not_found"
  | "not_categorized"
  | "already_posted"
  | "already_matched_to_bill"
  | "bill_backed"
  | "is_transfer"
  | "no_account"
  | "driver_advance_branch"
  | "account_cross_entity"
  | "account_not_postable"
  | "bank_account_ledger_unlinked"
  | "bank_ledger_account_class_mismatch"
  | "bank_account_hidden"
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
          bt.category::text                            AS category,
          lb.id::text                                  AS linked_bill_id,
          lb.status::text                              AS linked_bill_status,
          bt.matched_bill_id::text                     AS matched_bill_id,
          bt.matched_journal_entry_id::text            AS matched_journal_entry_id,
          bt.transfer_kind::text                       AS transfer_kind,
          bt.destination_bank_account_id::text         AS destination_bank_account_id,
          bt.matched_transfer_id::text                 AS matched_transfer_id,
          ba.ledger_account_id::text                   AS bank_ledger_account_id,
          ba.account_class::text                        AS bank_account_class,
          led.account_type::text                        AS bank_ledger_account_type,
          led.account_subtype::text                     AS bank_ledger_account_subtype,
          led.account_name::text                        AS bank_ledger_account_name,
          ba.hidden_at                                  AS bank_account_hidden_at,
          ca.id::text                                  AS cat_account_id,
          ca.operating_company_id::text                AS cat_account_opco,
          ca.deactivated_at                            AS cat_account_deactivated_at,
          ca.is_postable                               AS cat_account_is_postable
        FROM banking.bank_transactions bt
        LEFT JOIN banking.bank_accounts ba
          ON ba.id = bt.bank_account_id
          AND ba.operating_company_id = bt.operating_company_id
        -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED). These two resolve the GL ACCOUNTS this bank
        -- transaction will POST to — the categorised account and the bank's ledger account. The bank
        -- account join beside them was already pinned to bt.operating_company_id; these were not. An
        -- unscoped match here selects another entity's account as a posting target.
        LEFT JOIN catalogs.accounts ca
          ON ca.id = bt.categorization_gl_account_id
          AND ca.operating_company_id = bt.operating_company_id
        LEFT JOIN catalogs.accounts led
          ON led.id = ba.ledger_account_id
          AND led.operating_company_id = bt.operating_company_id
        -- ACCT-F5672 — resolve a BILL-backed categorization (bulk-post-as-bills / insurance
        -- dispersal stamp linked_entity_id = accounting.bills.id). Entity-scoped like every join here.
        LEFT JOIN accounting.bills lb
          ON lb.id = bt.linked_entity_id
          AND lb.operating_company_id = bt.operating_company_id
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
          category: string | null;
          linked_bill_id: string | null;
          linked_bill_status: string | null;
          matched_bill_id: string | null;
          matched_journal_entry_id: string | null;
          transfer_kind: string | null;
          destination_bank_account_id: string | null;
          matched_transfer_id: string | null;
          bank_ledger_account_id: string | null;
          bank_account_class: string | null;
          bank_ledger_account_type: string | null;
          bank_ledger_account_subtype: string | null;
          bank_ledger_account_name: string | null;
          bank_account_hidden_at: string | null;
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

    // Interlock 2b — BILL-BACKED categorization (ACCT-F5672). bulkPostTransactionsAsBills and the
    // insurance dispersal/policy paths stamp category='bill' + linked_entity_id=<accounting.bills.id>
    // (they never set matched_bill_id, so Interlock 2 misses them). The GL story for such a line
    // belongs to CHAIN-03 (the bill's own JE) + CHAIN-04 (the bill payment) — this categorize poster
    // posting it too would DOUBLE-BOOK the expense beside the bill JE. Measured live before this
    // interlock existed: 24 USMCA insurance-dispersal placeholder txns, every linked bill VOID, fell
    // through to the misleading "no_account" — which invites exactly the wrong fix (stamping an
    // account and minting expense JEs for voided bills). Skip with an honest reason instead.
    if (txn.category === "bill" || txn.linked_bill_id) {
      const voidNote =
        txn.linked_bill_status === "void" || txn.linked_bill_status === "voided"
          ? " The linked bill is VOID — there is no legitimate JE to mint for this line at all."
          : "";
      return {
        ok: false,
        reason: "bill_backed",
        message: `This transaction is backed by bill ${txn.linked_bill_id ?? "(unresolved)"}; its GL lives on the bill (CHAIN-03) and its payment (CHAIN-04), never the categorize poster.${voidNote}`,
      };
    }

    // Interlock 3 — own-bank transfer (no P&L). matched_transfer_id is the TRANSFER DEDUPE KEY shared
    // with transfers.service.ts / bank-recon match.service.ts (BANKING-GL-COMPLETION): a feed line
    // already linked to an internal banking.transfers row already has its cash movement covered by that
    // transfer's own JE and must never ALSO post here.
    if (txn.transfer_kind || txn.destination_bank_account_id || txn.review_state === "transfer" || txn.matched_transfer_id) {
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

    // The bridge being PRESENT is not the same as it being RIGHT, and a wrong bridge posts silently.
    // Measured on prod 2026-08-04: the "Business Platinum Card®" bank account (account_class='credit')
    // has ledger_account_id pointing at "Faro Factoring Reserves" — an Asset/Savings account. Because
    // this function trusted ledger_account_id verbatim, 120 categorized card purchases CREDITED
    // $41,191.86 to the factoring reserve between 2026-07-04 and 2026-08-04, where a card purchase must
    // instead CREDIT a card liability. Nothing errored; the books simply drifted.
    //
    // So validate the bridge's SHAPE, not just its presence: a credit-class account must bridge to a
    // Liability, a depository account to an Asset. A mismatch is a mapping defect that only a human can
    // resolve (which GL account represents this card), so refuse to post and say why. Refusing leaves
    // the line categorized and unposted — recoverable. Posting it wrong is not.
    const bankClass = (txn.bank_account_class ?? "").trim().toLowerCase();
    const ledgerType = (txn.bank_ledger_account_type ?? "").trim().toLowerCase();
    const expectedType = bankClass === "credit" ? "liability" : bankClass === "depository" ? "asset" : null;
    if (expectedType && ledgerType && ledgerType !== expectedType) {
      return {
        ok: false,
        reason: "bank_ledger_account_class_mismatch",
        message:
          `bank account class '${bankClass}' must bridge to a ${expectedType} GL account, but ` +
          `ledger_account_id points at '${txn.bank_ledger_account_name ?? "?"}' ` +
          `(${txn.bank_ledger_account_type}/${txn.bank_ledger_account_subtype}). ` +
          `Fix the bank account's ledger_account_id before posting.`,
      };
    }

    // BANK-ACCOUNT-HIDE: an account hidden for THIS entity can never receive a NEW GL posting (flag OFF
    // by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
    if (txn.bank_account_hidden_at && (await isBankAccountHideEnabled(client, input.companyId))) {
      return { ok: false, reason: "bank_account_hidden" };
    }

    // Sign landmine (LV-BANK-SIGN-COMMENT-IS-INVERTED, 2026-08-16): the stored sign varies by row and is
    // NOT a reliable direction signal either way (see the file-header note above for the live-measured
    // convention) — take the magnitude only and derive direction from the is_credit flag.
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
    // BANK-F05 — a categorization that has been reversed must RE-post, not silently return the
    // original batch.
    //
    // The revision is the number of journal entries for THIS source that have already been reversed.
    // That count is the only discriminator that is stable across a double-submit: it rises when
    // someone reverses, never when someone posts. Counting posting_batches instead would increment on
    // the repost itself, so a retried request would mint a SECOND corrected entry — a double-post.
    // reverseJournalEntryNoFlip stamps reversed_by_je_id on the original JE, which is what makes this
    // countable (it does not touch posting_batches at all — only postVoidReversal does).
    const reversedCountRows = await withCompanyScope(input.actorUserUuid, input.companyId, async (client) => {
      const r = await client.query(
        `SELECT COUNT(DISTINCT je.id)::text AS n
           FROM accounting.journal_entries je
           JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
                                                   AND p.operating_company_id = je.operating_company_id
          WHERE je.operating_company_id = $1::uuid
            AND p.source_transaction_type = 'bank_categorization'
            AND p.source_transaction_id::text = $2
            AND je.reversed_by_je_id IS NOT NULL`,
        [input.companyId, input.bankTransactionId]
      );
      return r.rows as Array<{ n: string }>;
    });
    const reversedCount = Number(reversedCountRows[0]?.n ?? 0);

    posted = await postSourceTransaction(
      {
        operating_company_id: input.companyId,
        source_transaction_type: "bank_categorization",
        source_transaction_id: input.bankTransactionId,
        ...(reversedCount > 0
          ? { posting_purpose: "repost" as const, repost_revision: reversedCount }
          : { posting_purpose: "initial_post" as const }),
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
