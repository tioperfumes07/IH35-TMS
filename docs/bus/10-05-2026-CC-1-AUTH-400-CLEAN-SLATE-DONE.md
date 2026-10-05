# CC-1 → Lead / owner — AUTH-400 CLEAN SLATE: DONE on production (2026-10-05 ~00:40Z)

**USMCA is a fresh file with the bank feed connected.**
- `accounting.journal_entry_postings` = **0**
- `accounting.journal_entries` = **0**
- Trial balance **DR 0 = CR 0**, 0 unbalanced entries.
- Bank lines kept: **1,011**. That is 1,009 plus 2 that arrived from the feed during the run. All 1,011 are **For Review**, and 0 are still matched.
- Master data, catalogs, identity, audit and WORM: unchanged.
- TRANSP / TRK: untouched (3,605 postings).

## Sequence, all under AUTH-400
1. Backup branch `br-fragrant-meadow-akuxvf8d` was cut at 22:40:05Z. It is **kept**.
2. One legacy one-sided reversal link was completed: `8314452b → 34b485eb`, with an audit event.
3. Void stage: every live document was voided through the engines. Live lines went 1,844 → 0, with 0 lines reversed twice.
4. Zero-reset purge, code `bbfcb66d32` (rehearsed 6 times on `br-small-leaf-akjde74y`). It ran in one transaction with in-transaction proofs, and every deleted row is in `audit.record_deletions`.

## Live guards on prod after the run
- verify-void-is-whole: PASS, 0
- verify-no-orphaned-gl: LIVE PASS
- verify-reversal-links-both-directions: LIVE PASS
- verify-settlement-gl-bills-link-their-entries: LIVE PASS
- verify-no-reversal-of-a-reversal: live chain 0

They join the money gate once CI is back (PRs will be opened, not merged through unrun checks).

## Per-table counts (USMCA rows, before → after, rule)
```
ZERO-RESET COUNTS (USMCA rows) — table: before -> after
    accounting.ar_collection_tasks                                2 ->       0  [planned rows gone]
    accounting.bill_lines                                        93 ->       0  [planned rows gone]
    accounting.bill_payments                                    130 ->       0  [zero]
    accounting.bills                                             93 ->       0  [zero]
    accounting.company_settlements                               51 ->       0  [zero]
    accounting.escrow_postings                                  230 ->       0  [zero]
    accounting.expense_lines                                    570 ->       0  [planned rows gone]
    accounting.expenses                                         559 ->       0  [zero]
    accounting.invoice_lines                                    106 ->       0  [planned rows gone]
    accounting.invoices                                         111 ->       0  [zero]
    accounting.journal_entries                                 4627 ->       0  [zero]
    accounting.journal_entry_postings                          9846 ->       0  [zero]
    accounting.load_revenue_recognition_postings                251 ->       0  [zero]
    accounting.outbox_events                                     78 ->       0  [zero]
    accounting.payment_applications                               8 ->       0  [zero]
    accounting.payments                                           7 ->       0  [zero]
    accounting.period_cash_basis_snapshot                         1 ->       0  [zero]
    accounting.posting_batches                                 3471 ->       0  [zero]
    accounting.reclassify_batch_lines                            12 ->       0  [zero]
    accounting.reclassify_batches                                 4 ->       0  [zero]
    accounting.transaction_source_links                        6394 ->       0  [planned rows gone]
    banking.reconciliation_drift_alerts                          10 ->       0  [zero]
    banking.reconciliation_matches                              144 ->       0  [zero]
    banking.reconciliation_sessions                               1 ->       0  [zero]
    dispatch.driver_layovers                                     52 ->       0  [planned rows gone]
    dispatch.late_arrival_aggregates                             10 ->       0  [planned rows gone]
    dispatch.load_assignment_history                            174 ->       0  [planned rows gone]
    dispatch.load_cancellations                                  16 ->       0  [planned rows gone]
    dispatch.load_charge_lines                                  148 ->       0  [planned rows gone]
    dispatch.non_owned_trailers                                   4 ->       0  [planned rows gone]
    dispatch.stop_arrivals                                        8 ->       0  [zero]
    dispatch.trailer_interchanges                                 2 ->       0  [planned rows gone]
    docs.files                                                  795 ->     493  [planned rows gone]
    driver_finance.deduction_schedule                             7 ->       0  [planned rows gone]
    driver_finance.driver_advances                               12 ->       0  [zero]
    driver_finance.driver_bills                                 136 ->       0  [zero]
    driver_finance.driver_liabilities                            12 ->       0  [zero]
    driver_finance.driver_settlement_deductions                  67 ->       0  [zero]
    driver_finance.driver_settlement_gl_bills                    90 ->       0  [zero]
    driver_finance.driver_settlement_gl_runs                     45 ->       0  [zero]
    driver_finance.driver_settlements                            64 ->       0  [zero]
    driver_finance.escrow_balances                               18 ->       0  [zero]
    driver_finance.escrow_ledger                                224 ->       0  [zero]
    driver_finance.payrun_gl_runs                                47 ->       0  [zero]
    driver_finance.presettlement_link_suggestions               162 ->       0  [zero]
    driver_finance.settlement_line_item_splits                   31 ->       0  [planned rows gone]
    driver_finance.settlement_lines                             355 ->       0  [zero]
    expense_attribution.expense_load_links                     1243 ->       0  [zero]
    fuel.fraud_alerts                                            44 ->       0  [planned rows gone]
    fuel.fuel_transaction_derivations                           263 ->       0  [planned rows gone]
    fuel.fuel_transactions                                      329 ->       0  [zero]
    fuel.tank_events                                            162 ->       1  [planned rows gone]
    fuel.tank_state                                              13 ->       0  [planned rows gone]
    geo.geofence_state_transitions                            10986 ->    9168  [planned rows gone]
    geo.geofence_vehicle_state                                 1230 ->     510  [planned rows gone]
    mdata.load_stops                                            382 ->       0  [planned rows gone]
    mdata.loads                                                 149 ->       0  [zero]
    telematics.load_odometer_segments                           210 ->       0  [planned rows gone]
    telematics.unit_stop_events                                 895 ->     320  [planned rows gone]
```
"planned rows gone" tables keep only rows that never belonged to a deleted record: truck/location telemetry (geofence transitions and vehicle state, unit stop events), one tank event, and driver documents in docs.files.

## Engine root causes fixed along the way
These are all merged, or open waiting for CI. Each has a guard.
- Two-way reversal links, plus a one-reversal unique index.
- Document void reverses LIVE lines only.
- Restore refuses to duplicate a live original.
- Settlement A/P chain refuses null journal-entry links; settlement void refuses over live GL.
- Sourced escrow deposits are idempotent.
- Void writer keeps each line's own source.
- No document can be removed out from under its GL (deferred trigger).
- Purge engine:
  - FK-cycle cuts using strongly connected components;
  - roots cover the full purge list;
  - snapshot, escrow-postings and stop-arrivals ARM L arms;
  - full-shortfall proof with a precise rule;
  - keeps its own release records;
  - rehearsal mode.
- Void stage voids whole, through executeVoidCancel.

## Open, not mine
- ACCT-F409 (CC-2): the 1090 deposit sweep on payment voids. It must land before the owner voids his first real customer payment.
