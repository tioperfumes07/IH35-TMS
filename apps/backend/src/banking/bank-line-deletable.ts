// BANK-F431 — THE ONE CANONICAL ANSWER TO "MAY THIS BANK LINE BE DELETED".
//
// Before this file there were four shipped engines with four different laws about
// banking.bank_transactions, and whichever script someone ran decided:
//
//   1. bank-tx-dedup.ts            — a superseded Plaid pending row is PRESERVED on purpose. Its own
//                                    comment: "Preserve the pending row as WORM evidence, but remove
//                                    it from active cash exactly once." It sets voided_at,
//                                    merged_into_bank_transaction_id = <survivor>, dedup_hash = NULL.
//   2. verify-no-hard-delete-bank-stubs.mjs — that file must not DELETE. It does not cover scripts/ops/.
//   3. 2026-09-28-cc2-r15518-purge-voided-usmca.ts (AUTH-101) — "DELETE CRITERION IS voided_at ALONE".
//   4. 2026-09-30-lead-owner-purge-voided-and-sample-usmca.ts (AUTH-181) —
//                                    "voided_at IS NOT NULL OR is_sample_data = true".
//   (+ 2026-10-02-cc1-r326-complete-delete.ts (AUTH-400) — banking PRESERVED, bank_transactions
//      RESET-only, never deleted.)
//
// Engine 1 exists to CREATE merge evidence. Engines 3 and 4 deleted exactly that evidence. Measured on
// prod USMCA from audit.row_changes: 274 bank lines deleted 2026-09-28 (AUTH-101), 10 on 09-30 and 9 on
// 10-01 (AUTH-181), all source='plaid', last at 2026-10-01T03:51:16.563Z. The superseder then began
// accumulating husks again immediately — the earliest surviving voided row is 2026-10-01T20:51:54.685Z,
// then 10-03 and 10-04, 22 in all. Purge, accumulate, purge, accumulate, and every cycle destroys the
// merged_into_bank_transaction_id link that proves a vanished bank line was REPLACED, not LOST.
//
// A superseded Plaid pending row is not a voided transaction. Nothing was entered and nothing was
// posted — the bank finalized its own provisional line. "voided_at alone" conflates two unrelated
// events: an operator reversing a booked transaction, and the feed replacing its own pending row.
//
// So the criterion stops being voided_at alone, in every engine at once, by importing from here.
// Nothing is deleted to achieve this and nothing new is hidden: these rows already fail every
// voided_at IS NULL filter on every screen.

/**
 * A bank line is a FEED-SUPERSESSION ARTIFACT — plumbing, not a voided transaction — when the feed
 * itself retired it in favour of a successor row that still exists.
 *
 * All three writers in bank-tx-dedup.ts are covered, with the exact strings they write (read from
 * source at bank-tx-dedup.ts:180, :256, :370 — not guessed):
 *   retirePlaidPendingPredecessor               -> 'replaced_by_plaid_posted:<plaid txn id>'
 *   supersedePlaidPendingByExactPostedCandidate -> 'operator_confirmed_plaid_pending_replacement:<id>'
 *   the duplicate-void arm                      -> 'merged_into_plaid'
 *
 * The merged_into pointer is the load-bearing clause and the reasons are belt-and-suspenders, because
 * a row whose pointer an earlier reset cleared must still be recognised. Measured on prod USMCA
 * 2026-10-05: all 22 voided rows carry merged_into_bank_transaction_id, and all 22 carry the
 * 'replaced_by_plaid_posted:' reason — zero carry the operator-remediation reason, so a clause written
 * from that one string alone would have matched nothing and the purge would still have eaten them.
 */
export function bankLineIsFeedSupersessionArtifact(alias = "bt"): string {
  return `(
      ${alias}.merged_into_bank_transaction_id IS NOT NULL
      OR ${alias}.voided_reason LIKE 'replaced_by_plaid_posted:%'
      OR ${alias}.voided_reason LIKE 'operator_confirmed_plaid_pending_replacement:%'
      OR ${alias}.voided_reason = 'merged_into_plaid'
    )`;
}

/**
 * The ONLY predicate any engine may use to decide that a banking.bank_transactions row is deletable.
 *
 * All five clauses are here on purpose, because an engine that imports four of them is an engine that
 * deletes something it should not:
 *   1. it must be voided — a live bank line is never purge fodder;
 *   2. it must NOT be a feed-supersession artifact (the whole of BANK-F431);
 *   3. it must carry no GL categorization, no matched journal entry and no reconciled obligation —
 *      deleting a line that reached the ledger orphans the posting;
 *   4. it must carry no remaining reconciliation match in any non-released state;
 *   5. it must carry no splits.
 *
 * is_sample_data is NOT part of this: a sample row is deletable on its own ground (it is not real), and
 * folding it in here would let an engine delete a LIVE sample-flagged line. Engines that purge sample
 * data OR it alongside this predicate, never inside it.
 */
export function bankLineDeletablePredicate(alias = "bt"): string {
  return `(
      ${alias}.voided_at IS NOT NULL
      AND NOT ${bankLineIsFeedSupersessionArtifact(alias)}
      AND ${alias}.categorization_gl_account_id IS NULL
      AND ${alias}.matched_journal_entry_id IS NULL
      AND ${alias}.reconciled_obligation_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM banking.reconciliation_matches rm
         WHERE rm.bank_transaction_id = ${alias}.id
           AND rm.match_state <> 'released'
      )
      AND NOT EXISTS (
        SELECT 1 FROM banking.bank_transaction_splits s
         WHERE s.bank_transaction_id = ${alias}.id
      )
    )`;
}

/**
 * NO SILENT DELETES. audit.record_deletions held ZERO rows for banking.bank_transactions after 327
 * lines were removed, and audit.row_changes recorded no `action` and no `changed_by_role` on any of
 * them — so the database could not say which engine, which AUTH, or which operator did it. AUTH-400's
 * engine already records every row it removes; the two ad-hoc scripts did not, for this table.
 *
 * Every engine writes this BEFORE its DELETE, inside the same transaction, so the record survives the
 * row. `route` names the engine (e.g. 'auth_purge_voided_usmca'), `authId` the OPEN owner AUTH.
 */
export function recordBankLineDeletionsSql(wherePredicateOnBt: string): string {
  return `
    INSERT INTO audit.record_deletions
      (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data)
    SELECT bt.operating_company_id, $2::text, $3::text, 'banking.bank_transactions',
           bt.id::text, $4::text, to_jsonb(bt)
      FROM banking.bank_transactions bt
     WHERE bt.operating_company_id = $1::uuid
       AND (${wherePredicateOnBt})
  `;
}

/** Same record, for an engine that has already resolved the exact id list it will delete. */
export function recordBankLineDeletionsByIdSql(): string {
  return `
    INSERT INTO audit.record_deletions
      (operating_company_id, deletion_route, auth_id, table_name, row_pk, reason, row_data)
    SELECT bt.operating_company_id, $2::text, $3::text, 'banking.bank_transactions',
           bt.id::text, $4::text, to_jsonb(bt)
      FROM banking.bank_transactions bt
     WHERE bt.id = ANY($1::uuid[])
  `;
}
