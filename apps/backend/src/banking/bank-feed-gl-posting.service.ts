// BLOCK-03 / CHAIN-05 — Bank-feed categorization → GL posting (GAP-CLOSURE).
//
// LIVE-ARMED FOR USMCA (confirmed lib.feature_flag_overrides 2026-09-03: BANK_FEED_GL_POSTING_ENABLED
// enabled=true for operating_company_id=5c854333-..., set 2026-08-16, no expiry). The old
// [HOLD-FOR-JORGE — TIER 1] marker was stale — the file said held while the database said armed. As of
// 2026-09-03 the USMCA bank queue is 343 real categorizable rows (400 total, 57 voided: 9 pre-existing +
// 48 confirmed duplicate-Plaid-connection rows purged that day), 0 categorized, 0 posted — this path has
// never actually fired for USMCA. The owner categorizes from here forward; treat the next real post as the
// first live proof of this chain, not an assumption.
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
import { createAndPostBankLineExpenseOnClient, resolveExpenseItemForAccount } from "../accounting/bank-line-expense.service.js";
import { createAndPostBankLineDepositOnClient } from "../accounting/bank-deposits.service.js";
import { isBankAccountHideEnabled } from "./bank-account-visibility.js";

export const BANK_FEED_GL_POSTING_FLAG_KEY = "BANK_FEED_GL_POSTING_ENABLED";

export type BankFeedGlSkipReason =
  | "flag_off"
  | "bank_txn_not_found"
  | "not_categorized"
  | "already_posted"
  | "already_matched_to_bill"
  | "already_matched_to_document"
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
      /** ROUND 441.5 — the expense document a money-out line to an expense account created (QBO "Categorize + Add"). */
      expense_id?: string;
      /** ROUND 441.5 Phase 2 — the deposit document a money-in line created (QBO "Add funds to this deposit"). */
      deposit_id?: string;
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
  categorizedAccountType: string | null;
  bankLedgerAccountId: string;
  amountCents: number;
};
type Decision = { ok: false; reason: BankFeedGlSkipReason; message?: string } | DecisionOk;

/**
 * Read-only decision phase (inside one company-scoped transaction): checks the flag, reads the bank
 * transaction + its bank-account cash-GL bridge + the chosen account's validity, applies the three
 * double-post interlocks, and derives direction from the is_credit flag. Never writes.
 */
type PgClient = Parameters<Parameters<typeof withCompanyScope>[2]>[0];

async function decideOnClient(client: PgClient, input: MaybePostBankCategorizationInput): Promise<Decision> {
  {
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
          COALESCE(bt.matched_expense_id, bt.matched_fuel_transaction_id, bt.matched_relay_fuel_transaction_id,
                   bt.matched_invoice_id, bt.matched_payment_id, bt.matched_bill_payment_id, bt.matched_settlement_id,
                   bt.matched_factoring_advance_id, bt.matched_advance_id, bt.matched_deposit_id)::text AS matched_document_id,
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
          ca.is_postable                               AS cat_account_is_postable,
          ca.account_type::text                        AS cat_account_type
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
          matched_document_id: string | null;
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
          cat_account_type: string | null;
        }
      | undefined;
    if (!txn) return { ok: false, reason: "bank_txn_not_found" };

    // Only a categorized line posts (a transfer/excluded/for-review line is not a Categorize action).
    if (txn.status !== "categorized") return { ok: false, reason: "not_categorized" };

    // Idempotency: a row already carrying a CHAIN-05 JE never re-posts.
    if (txn.matched_journal_entry_id) return { ok: false, reason: "already_posted" };

    // Interlock 2 — matched to a bill (CHAIN-03/04 sourced it; Match, not Categorize).
    if (txn.matched_bill_id) return { ok: false, reason: "already_matched_to_bill" };
    // OWNER LAW 2026-10-02 competing-engine audit: a line already MATCHED to the document that created it (expense,
    // fuel purchase, Relay fill, invoice, payment, bill payment, settlement, factoring advance, cash advance) is booked by
    // that match — categorizing it too would post the same money twice.
    if (txn.matched_document_id) return { ok: false, reason: "already_matched_to_document" };

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
      categorizedAccountType: txn.cat_account_type,
      bankLedgerAccountId: txn.bank_ledger_account_id,
      amountCents,
    };
  }
}

/**
 * CHAIN-05 entry point — called by the bank categorize route AFTER the tag has been persisted, behind the
 * OFF-by-default BANK_FEED_GL_POSTING_ENABLED flag. When (flag ON) + (a valid, non-ceded, non-transfer,
 * unmatched categorized line), it posts the direction-aware balanced JE via the EXISTING posting engine and
 * stamps the durable back-pointer (matched_journal_entry_id + reviewed_at + review_state='matched'). In
 * every other case it is a NO-OP returning a structured reason (the tag itself is unaffected).
 */
export async function maybePostBankCategorizationToGl(input: MaybePostBankCategorizationInput): Promise<BankFeedGlResult> {
  // One transaction: decide, post and stamp together (OWNER LAW 2026-10-02 — a bank line's JE is written in the same DB
  // transaction as the categorization/match that causes it). Callers that already hold the categorize transaction call
  // postBankCategorizationOnClient directly.
  return withCompanyScope(input.actorUserUuid, input.companyId, (client) => postBankCategorizationOnClient(client, input));
}

/**
 * The bank-line -> GL poster, on the CALLER's client (same transaction as the categorization). A skip (flag off, ceded,
 * already matched, ...) returns { posted:false, reason }; a posting failure THROWS so the caller's transaction — and
 * with it the categorization — rolls back. A categorized line can never be left committed without its entry.
 */
export async function postBankCategorizationOnClient(client: PgClient, input: MaybePostBankCategorizationInput): Promise<BankFeedGlResult> {
  const decision = await decideOnClient(client, input);
  if (!decision.ok) return { posted: false, reason: decision.reason, message: decision.message };

  // ROUND 441.5 / 441.16 (owner 2026-10-07: "ours should work exactly as quickbooks") — QBO "Categorize + Add" always mints
  // a DOCUMENT; the category is only the other leg. Money OUT, to any account (expense, a liability such as 2410, equity,
  // an asset), is an Expense paid from the bank. Money IN, to any account, is a Deposit. No third case, and never a bare
  // journal entry.
  if (decision.direction === "money_out") {
    return postBankLineAsExpenseOnClient(client, input, decision);
  }
  return postBankLineAsDepositOnClient(client, input, decision);
}

/**
 * ROUND 441.5 / 441.16 — the categorized money-out line (any account) becomes an Expense: payee = the vendor the operator tagged, paid from the
 * bank's ledger account, one line on the chosen account with its item and the line's load / unit / trailer / driver
 * tags. Posted by the existing expense poster in this transaction; the line and the document name each other
 * (bank_transactions.matched_expense_id + matched_journal_entry_id; expenses.source_bank_transaction_id), so Undo of the
 * line voids the expense and voiding the expense releases the line. resolution_kind 'added': this line created it.
 */
async function postBankLineAsExpenseOnClient(
  client: PgClient,
  input: MaybePostBankCategorizationInput,
  decision: DecisionOk
): Promise<BankFeedGlResult> {
  const lineRes = await client.query(
    `SELECT bt.transaction_date::text AS transaction_date, bt.description, bt.categorization_memo,
            bt.categorization_vendor_id::text AS vendor_id, bt.categorization_item_id::text AS item_id,
            bt.categorization_load_id::text AS load_id, bt.categorization_unit_id::text AS unit_id,
            bt.categorization_trailer_id::text AS trailer_id, bt.categorization_driver_id::text AS driver_id,
            ca.account_number, ca.account_name
       FROM banking.bank_transactions bt
       JOIN catalogs.accounts ca ON ca.id = bt.categorization_gl_account_id AND ca.operating_company_id = bt.operating_company_id
      WHERE bt.id = $1::uuid AND bt.operating_company_id = $2::uuid
      LIMIT 1`,
    [input.bankTransactionId, input.companyId]
  );
  const line = lineRes.rows[0] as
    | {
        transaction_date: string;
        description: string | null;
        categorization_memo: string | null;
        vendor_id: string | null;
        item_id: string | null;
        load_id: string | null;
        unit_id: string | null;
        trailer_id: string | null;
        driver_id: string | null;
        account_number: string | null;
        account_name: string | null;
      }
    | undefined;
  if (!line) return { posted: false, reason: "bank_txn_not_found" };

  // The vendor must be this company's; a tag from elsewhere is refused, never carried onto the document.
  if (line.vendor_id) {
    const v = await client.query(
      `SELECT 1 FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
      [line.vendor_id, input.companyId]
    );
    if (!v.rows[0]) return { posted: false, reason: "account_cross_entity", message: "The tagged vendor is not an active vendor of this company." };
  }

  const itemId = await resolveExpenseItemForAccount(client as never, {
    operatingCompanyId: input.companyId,
    accountId: decision.categorizedAccountId,
    explicitItemId: line.item_id,
    accountLabel: [line.account_number, line.account_name].filter(Boolean).join(" "),
  });

  const description = (line.categorization_memo ?? "").trim() || (line.description ?? "").trim() || "Bank transaction";
  const created = await createAndPostBankLineExpenseOnClient(
    client as never,
    {
      operatingCompanyId: input.companyId,
      transactionDate: line.transaction_date,
      amountCents: decision.amountCents,
      memo: description.slice(0, 500),
      vendorId: line.vendor_id,
      paymentAccountId: decision.bankLedgerAccountId,
      expenseAccountId: decision.categorizedAccountId,
      itemId,
      lineDescription: description.slice(0, 500),
      sourceBankTransactionId: input.bankTransactionId,
      loadId: line.load_id,
      unitId: line.unit_id,
      trailerId: line.trailer_id,
      driverId: line.driver_id,
    },
    { userId: input.actorUserUuid }
  );

  await client.query(
    `UPDATE banking.bank_transactions
        SET matched_expense_id = $1::uuid,
            matched_journal_entry_id = $2::uuid,
            review_state = 'matched',
            resolution_kind = 'added', -- this line CREATED the expense; Undo voids it
            reviewed_at = now(),
            updated_at = now()
      WHERE id = $3::uuid AND operating_company_id = $4::uuid AND matched_journal_entry_id IS NULL`,
    [created.expense_id, created.journal_entry_id, input.bankTransactionId, input.companyId]
  );

  return {
    posted: true,
    journal_entry_id: created.journal_entry_id,
    posting_batch_id: created.posting_batch_id ?? "",
    direction: decision.direction,
    categorized_account_id: decision.categorizedAccountId,
    bank_ledger_account_id: decision.bankLedgerAccountId,
    amount_cents: decision.amountCents,
    already_posted: false,
    expense_id: created.expense_id,
  };
}

/**
 * ROUND 441.5 Phase 2 — the categorized money-in line becomes a Deposit: Dr the bank's ledger account / Cr the chosen
 * account, received from the vendor or customer the operator tagged, through the existing deposit poster in this
 * transaction. The line and the document name each other (bank_transactions.matched_deposit_id + matched_journal_entry_id;
 * deposits.source_bank_transaction_id); Undo voids the deposit, voiding the deposit releases the line.
 */
async function postBankLineAsDepositOnClient(
  client: PgClient,
  input: MaybePostBankCategorizationInput,
  decision: DecisionOk
): Promise<BankFeedGlResult> {
  const lineRes = await client.query(
    `SELECT bt.transaction_date::text AS transaction_date, bt.description, bt.categorization_memo,
            bt.bank_account_id::text AS bank_account_id,
            bt.categorization_vendor_id::text AS vendor_id, bt.categorization_customer_id::text AS customer_id
       FROM banking.bank_transactions bt
      WHERE bt.id = $1::uuid AND bt.operating_company_id = $2::uuid
      LIMIT 1`,
    [input.bankTransactionId, input.companyId]
  );
  const line = lineRes.rows[0] as
    | {
        transaction_date: string;
        description: string | null;
        categorization_memo: string | null;
        bank_account_id: string | null;
        vendor_id: string | null;
        customer_id: string | null;
      }
    | undefined;
  if (!line || !line.bank_account_id) return { posted: false, reason: "bank_txn_not_found" };

  // The payer must be this company's; a tag from elsewhere is refused, never carried onto the document.
  for (const [table, id] of [
    ["mdata.vendors", line.vendor_id],
    ["mdata.customers", line.customer_id],
  ] as const) {
    if (!id) continue;
    const r = await client.query(`SELECT 1 FROM ${table} WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`, [id, input.companyId]);
    if (!r.rows[0]) return { posted: false, reason: "account_cross_entity", message: "The tagged payer is not a vendor or customer of this company." };
  }

  const description = (line.categorization_memo ?? "").trim() || (line.description ?? "").trim() || "Bank deposit";
  const created = await createAndPostBankLineDepositOnClient(
    client as never,
    {
      operatingCompanyId: input.companyId,
      depositDate: line.transaction_date,
      amountCents: decision.amountCents,
      bankAccountId: line.bank_account_id,
      bankLedgerAccountId: decision.bankLedgerAccountId,
      accountId: decision.categorizedAccountId,
      // One payer per line (deposit_lines_one_payer): the customer when both are tagged.
      receivedFromCustomerId: line.customer_id,
      receivedFromVendorId: line.customer_id ? null : line.vendor_id,
      description,
      sourceBankTransactionId: input.bankTransactionId,
    },
    { userId: input.actorUserUuid }
  );

  await client.query(
    `UPDATE banking.bank_transactions
        SET matched_deposit_id = $1::uuid,
            matched_journal_entry_id = $2::uuid,
            review_state = 'matched',
            resolution_kind = 'added', -- this line CREATED the deposit; Undo voids it
            reviewed_at = now(),
            updated_at = now()
      WHERE id = $3::uuid AND operating_company_id = $4::uuid AND matched_journal_entry_id IS NULL`,
    [created.deposit_id, created.journal_entry_id, input.bankTransactionId, input.companyId]
  );

  return {
    posted: true,
    journal_entry_id: created.journal_entry_id,
    posting_batch_id: created.posting_batch_id ?? "",
    direction: decision.direction,
    categorized_account_id: decision.categorizedAccountId,
    bank_ledger_account_id: decision.bankLedgerAccountId,
    amount_cents: decision.amountCents,
    already_posted: false,
    deposit_id: created.deposit_id,
  };
}
