# ENG-17 — first read-only Faro batch, 2026-10-26

Status: OPEN. This is document reconciliation, **not** a money repair or DONE-LIVE claim.

Production branch identity was verified with assert-neon-branch before connecting. All reads used
BEGIN READ ONLY, app.bypass_rls=lucia, app.operating_company_id set to USMCA, and ROLLBACK.
No bank match, journal entry, purchase, or document was written.

## Measured

- 25 purchase documents, 17 posted and non-voided.
- Every one of the 17 posted documents ties: its net-to-company amount minus its live linked bank amount
  equals the signed 1090 ledger balance grouped by its factoring advance.
- 3 posted purchases have live bank links and zero remaining 1090 balance.
- 14 posted purchases have no live bank link. The old claim that none were matched is stale.
- 1090 ledger has 25 factoring-advance source groups and 3 factoring-advance-deposit source groups.
- 2510 has 802 expense and 75 fuel-event source groups. These counts do not prove payment or authorize clearing.

## Reproducible comparison

For each `accounting.factoring_purchases` row with USMCA operating_company_id,
`status='posted' AND voided_at IS NULL`, join:

1. `banking.bank_transactions.matched_factoring_advance_id = factoring_advance_id`, same company,
   `voided_at IS NULL AND merged_into_bank_transaction_id IS NULL`; sum absolute amount_cents.
2. `accounting.journal_entry_postings.source_transaction_id = factoring_advance_id::text`, same company,
   account 1090, joined same-company journal entry and posting batch. Sum debit minus credit using
   the three ledger membership clauses from `accounting/ledger-membership.ts` (void, sample, batch).
3. Assert per document `net_to_company_cents - linked_bank_amount = ledger_balance`.

Comparison returned 17 ties, zero mismatches. Exact monetary detail stays on the private bus, not in this public report.

## Named blocker / next action

`factoring/owner-only-purchase.ts` and migration `202615180800_factoring_purchase_document.sql`
reserve purchase creation/posting/matching to the owner. The remaining residual cannot be zeroed just
because it is nonzero. It requires owner-selected bank evidence through the existing match engine.
Do not issue a balancing JE or silently match any of the 14 documents. No correction batch is approved
by this report. 2510 still requires its own payment/expense evidence; AUTH-453 remains excluded.

ENG-17 stays OPEN with this named blocker while the assigned non-blocked build queue proceeds.
