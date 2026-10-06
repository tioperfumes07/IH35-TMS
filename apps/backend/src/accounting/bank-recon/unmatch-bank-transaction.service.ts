// Leaf module: bank transaction unmatch logic.
// Extracted from recon-worklist.service.ts to break the import cycle with
// banking/bank-line-state-machine.service.ts.
import type { PoolClient } from "pg";
import { attachReleaseReversals, releaseBankLineMatches, releasedInThisTransaction, type BankLineReleaseKind } from "../../banking/bank-line-release.js";
import { type LedgerEntryKind } from "./match.service.js";
import { reverseJournalEntryNoFlip } from "../journal-entries.service.js";

export type UnmatchOnClientResult = {
  released: Array<{ kind: LedgerEntryKind; id: string }>;
  reversed_match_journal_entry_id: string | null;
};

/**
 * ROUND 360 — UNMATCH on the caller's transaction. Breaks the link ONLY: the document is untouched, its own flags
 * (source_bank_transaction_id, cleared_date) are cleared, and its match row goes to 'rejected', so the document is back
 * in the candidate pool. The single GL exception is a JE this match WRITER created (fuel/relay fill, factoring
 * chargeback — OWNER-ORDER 2026-10-02 §4); a document that already existed is never reversed.
 */
export async function unmatchBankTransactionOnClient(
  client: PoolClient,
  input: { operating_company_id: string; bank_transaction_id: string; actor_user_uuid: string; release_kind?: BankLineReleaseKind }
): Promise<UnmatchOnClientResult> {
  // ROUND 363-CC3-B — record the release of every match this line carries BEFORE the pointers clear (LAW 363.9: the
  // accepted match stays, the release is written beside it; trg_send_back_keeps_the_match refuses the commit otherwise).
  await releaseBankLineMatches(client, {
    bankTransactionId: input.bank_transaction_id,
    kind: input.release_kind ?? "unmatch",
    reason: "bank_line_unmatched",
    actorUserId: input.actor_user_uuid,
  });
  // Same CTE-captures-pre-update-values shape reconciliation.routes.ts's session-scoped unmatch
  // already uses — Postgres UPDATE...RETURNING reflects the NEW row, so the ids to reverse/reject
  // have to come from a snapshot taken before the UPDATE, not the UPDATE's own output.
  const res = await client.query<{
    id: string;
    prev_expense_id: string | null;
    prev_transfer_id: string | null;
    prev_journal_entry_id: string | null;
    prev_load_id: string | null;
    prev_bill_id: string | null;
    prev_settlement_id: string | null;
    prev_payment_id: string | null;
    prev_bill_payment_id: string | null;
    prev_fuel_transaction_id: string | null;
    prev_relay_fuel_transaction_id: string | null;
    prev_factoring_advance_id: string | null;
    prev_deposit_id: string | null;
  }>(
    `
      WITH prior AS (
        SELECT id, matched_expense_id, matched_transfer_id, matched_journal_entry_id,
               matched_load_id, matched_bill_id, matched_settlement_id,
               matched_payment_id, matched_bill_payment_id,
               matched_fuel_transaction_id, matched_relay_fuel_transaction_id,
               matched_factoring_advance_id, matched_deposit_id
        FROM banking.bank_transactions
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
          AND voided_at IS NULL
      )
      UPDATE banking.bank_transactions bt
      SET matched_expense_id = NULL,
          matched_transfer_id = NULL,
          matched_journal_entry_id = NULL,
          matched_load_id = NULL,
          matched_bill_id = NULL,
          matched_settlement_id = NULL,
          matched_payment_id = NULL,
          matched_bill_payment_id = NULL,
          matched_factoring_advance_id = NULL,
          matched_fuel_transaction_id = NULL,
          matched_relay_fuel_transaction_id = NULL,
          -- OWNER-ORDER 2026-10-02 §4 — these three were left set on unmatch (half-release).
          matched_invoice_id = NULL,
          matched_advance_id = NULL,
          -- ROUND 373.4 — the deposit link. A deposit match created no JE (the deposit posted when it was made), so
          -- unmatch only releases the link; the deposit and its posting stand.
          matched_deposit_id = NULL,
          categorization_gl_account_id = NULL,
          -- 'unmatched' is not a legal review_state (CHECK: for_review|categorized|excluded|matched|
          -- transfer) — 'for_review' is the correct "back in the queue" state, and unlike the
          -- session-scoped unmatch (reconciliation.routes.ts, which leaves review_state untouched at
          -- 'matched' with no matched_*_id pointers — a pre-existing orphaned-state gap, out of
          -- scope here) this one gets it right.
          review_state = 'for_review',
          -- ROUND 326 queue item 14 (G-18): when unmatch reverses a match-created JE (fuel/relay/
          -- recourse below), the line goes back to the categorization queue. Leaving it
          -- 'categorized' with no JE made the categorized-backlog poster re-post it — reverse,
          -- re-post, reverse — the 6300 gross churn.
          status = CASE WHEN prior.matched_journal_entry_id IS NOT NULL AND bt.status = 'categorized'
                        THEN 'pending_categorization' ELSE bt.status END,
          updated_at = now()
      FROM prior
      WHERE bt.id = prior.id
      RETURNING
        bt.id,
        prior.matched_expense_id::text AS prev_expense_id,
        prior.matched_transfer_id::text AS prev_transfer_id,
        prior.matched_journal_entry_id::text AS prev_journal_entry_id,
        prior.matched_load_id::text AS prev_load_id,
        prior.matched_bill_id::text AS prev_bill_id,
        prior.matched_settlement_id::text AS prev_settlement_id,
        prior.matched_payment_id::text AS prev_payment_id,
        prior.matched_bill_payment_id::text AS prev_bill_payment_id,
        prior.matched_fuel_transaction_id::text AS prev_fuel_transaction_id,
        prior.matched_relay_fuel_transaction_id::text AS prev_relay_fuel_transaction_id,
        prior.matched_factoring_advance_id::text AS prev_factoring_advance_id,
        prior.matched_deposit_id::text AS prev_deposit_id
    `,
    [input.bank_transaction_id, input.operating_company_id]
  );
  const row = res.rows[0];
  if (!row) throw new Error("bank_transaction_not_found");

  // OWNER-ORDER 2026-10-02 §4 — reverse ONLY JEs this match writer created (fuel/relay fill post
  // or factoring chargeback on 1230). Do NOT reverse a JE that was merely matched as the ledger
  // target (kind=je) or that categorize wrote — those use undo-categorization / void of the JE.
  const matchCreatedJe = Boolean(
    row.prev_fuel_transaction_id || row.prev_relay_fuel_transaction_id || row.prev_factoring_advance_id
  );
  if (row.prev_journal_entry_id && matchCreatedJe) {
    await reverseJournalEntryNoFlip(client, {
      operatingCompanyId: input.operating_company_id,
      journalEntryId: row.prev_journal_entry_id,
      reason: "bank_transaction_unmatched",
      actorUserId: input.actor_user_uuid,
    });
    await attachReleaseReversals(client, input.bank_transaction_id, [row.prev_journal_entry_id]);
  }

  // BNK-11 — clear the reverse (ledger-side) back-pointer too, scoped to "still points at THIS
  // bank transaction" so a link that has since moved on (re-matched elsewhere, or posted directly)
  // is never touched by unmatching a now-stale reference.
  //
  // BANK-F26053 — clear cleared_date alongside source_bank_transaction_id, same scope. Unmatching
  // detaches this payment from the reconciliation session it settled in (THREE-DATES-COVERAGE-GAP:
  // cleared_date drives ONLY that), so leaving a stale cleared_date after unmatch would misreport
  // a session the payment no longer belongs to.
  if (row.prev_payment_id) {
    await client.query(
      `UPDATE accounting.payments
          SET source_bank_transaction_id = NULL,
              cleared_date = NULL
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND source_bank_transaction_id = $3::uuid`,
      [row.prev_payment_id, input.operating_company_id, input.bank_transaction_id]
    );
  }
  if (row.prev_bill_payment_id) {
    await client.query(
      `UPDATE accounting.bill_payments
          SET source_bank_transaction_id = NULL,
              from_bank_account_id = NULL,
              cleared_date = NULL,
              updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND source_bank_transaction_id = $3::uuid`,
      [row.prev_bill_payment_id, input.operating_company_id, input.bank_transaction_id]
    );
  }
  if (row.prev_settlement_id) {
    await client.query(
      `UPDATE driver_finance.driver_settlements
          SET paid_via_bank_txn_id = NULL,
              updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND paid_via_bank_txn_id = $3::uuid`,
      [row.prev_settlement_id, input.operating_company_id, input.bank_transaction_id]
    );
  }

  // ROUND 363-CC3-B — what this unmatch let go of is exactly what it released above (every pointer, plus any live match
  // row with no pointer behind it). Nothing is flipped to 'rejected' in place any more: an unmatch is "undo my link", and
  // the accepted row keeps saying what the line was matched to.
  const rejectedKinds = (await releasedInThisTransaction(client, input.bank_transaction_id)) as Array<{ kind: LedgerEntryKind; id: string }>;

  return {
    released: rejectedKinds,
    reversed_match_journal_entry_id: row.prev_journal_entry_id && matchCreatedJe ? row.prev_journal_entry_id : null,
  };
}

