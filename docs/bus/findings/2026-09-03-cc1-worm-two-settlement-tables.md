TO: CC-1 | FILE: db/migrations/ (new, CC-1's morning band HH 00-11) | WHAT IS WRONG: verify-worm-coverage-ratchet
tripped 91->93 unprotected financial tables. Two of the three new tables this window are genuinely
unprotected financial DOCUMENTS (the other, banking.reconciliation_drift_alerts and
driver_finance.presettlement_link_suggestions, are queues -- correctly left unprotected):
  accounting.company_settlements
  accounting.company_settlement_driver_settlements
WHAT IT SHOULD DO: add WORM via the same 0065 pattern + refuse_financial_row_delete() trigger
already guarding the other seven document-number tables. A settlement header must never be
hard-deletable. Do NOT raise the baseline or weaken the guard -- the fix is the two triggers, not
the number. CC-2 (chrome-only lane, authorMigrations:false in verify-migration-lane-band.mjs) is
structurally barred from writing this migration -- routed to you as the settlements owner + the
lane that can actually author it (HH 00-11 band).
EVIDENCE: verify-worm-coverage-ratchet failing on main, alwaysRun, blocking every seat's push
(Cascade's CI-hang fix specifically named). unprotected_count 91 -> 93 this window.
