# GO-26 PURGE LEDGER — banking schema — 2026-09-02

Third of six schema PRs (`accounting` → `driver_finance` → **`banking`** → `factoring` →
`dispatch` → `fuel`).

## Real FK found live: 148 KEPT bank_transactions wrongly linked to a fixture session

`banking.bank_transactions.reconciliation_session_id` FKs to `reconciliation_sessions`.
Reconciliation session `787939fe` (already `status='voided'` from a PRIOR owner-authorized purge
pass — `void_reason: "OWNER-USMCA-SEAT-JUNK-PURGE-2026-09-01"`) still had 148 of the KEPT, real
`bank_transactions` rows pointing at it. This is not a delete-blocker to work around — it is
exactly the state the owner's own goal describes ("only bank transactions should appear
uncategorized since December 2025"): those 148 real transactions were wrongly marked reconciled
against a fixture session. Cleared `reconciliation_session_id = NULL` on those 148 rows (the
transactions themselves — amount, date, Plaid data — are untouched), then deleted the 3 sessions.

Full JSON for `reconciliation_matches` (118 rows) is committed separately at
`docs/audit/GO-26-PURGE-LEDGER-banking-reconciliation-matches.json` — too large to inline.

## Rows captured before deletion (smaller tables)

### reconciliation_drift_alerts (4 rows)
4 same-day (2026-09-02) alerts on 3 different bank accounts — critical/warning, drift up to
$2,493.68. Not literally "TEST"-tagged, but named explicitly in the owner's own GO-26 PART 1.2
list, and downstream of the same fixture-contaminated book balances this whole purge removes — a
correct fresh alert will regenerate from clean data if a real drift remains. Voided (voided_at
stamped) then deleted.

### reconciliation_sessions (3 rows)
All 3 already `status='voided'` — 1 from `OWNER-USMCA-SEAT-JUNK-PURGE-2026-09-01` ("statement
$93.68 vs uncleared Plaid feed"), 2 from `GO-ACCT-01 migration backfill` (duplicate sessions for
the same account+period). Deleted after clearing the 148-transaction FK above.

### transfers (3 rows)
`39b59c18` "TEST DATA cash deposit keep" $1,200 · `5a3dfd65` "Deposit PMT-2026-00009... breakdown-
relay hop 9 scenario proof" $1,200 (explicit "hop" per the owner's own probe/hop category) ·
`89363414` "BANK-DOM-05 live smoke TRANSPâ†’USMCA" $1.00 (cross-entity smoke test).

### bank_transaction_splits (2 rows)
`c6ab4e82`/`e733f76c` "TEST DATA VOID-AT-LAUNCH Palos Garza split line 1/2" — both attached to a
REAL, kept `bank_transactions` row (`f9cc15bf`). Deleting the split categorization restores that
transaction to uncategorized, which is exactly the owner's stated end state for real bank feed
rows. Voided (voided_at stamped) then deleted; the parent bank_transactions row is untouched.

### intercompany_transfer_groups (1 row)
`4d426a4a` — pairs USMCA with TRANSP (`91e0bf0a`), no notes/memo, created 2026-08-29.

**Process note:** the void-stamp sub-step for `reconciliation_drift_alerts` and
`bank_transaction_splits` was applied on the FIRST attempt (which rolled back atomically on the
`bank_transactions` FK violation) but not re-applied on the successful retry — the retry went
straight to delete once the FK was cleared. Full row JSON was captured before either attempt, so
nothing is undocumented; noting the skipped intermediate stamp honestly rather than implying it
happened when it didn't.

## RESULT — live on Neon, before vs after

AFTER (4 nonzero, all KEEP-list):
```
bank_transactions 395 (owner's explicit exception) · bank_accounts 5 · transaction_categories 4 ·
intercompany_entity_pairs 2
```
Zero non-keep-list rows remain in `banking`.
