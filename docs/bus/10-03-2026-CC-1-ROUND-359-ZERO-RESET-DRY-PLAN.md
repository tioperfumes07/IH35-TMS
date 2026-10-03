# CC-1 — ROUND 359 — ZERO-RESET DRY PLAN (USMCA). Read this before writing the AUTH rows.

**Run:** 2026-10-03 ~12:00Z, `scripts/ops/2026-10-02-cc1-r326-complete-delete.ts --scope=zero-reset`, DRY (read-only, `BEGIN READ ONLY`, rolled back — nothing written), against production `br-fancy-credit-akjnd07a` with the read-only role, under the bypass. Engine = main after **#24513** (ROUND 359 additions 1 + 2).

## What changed for ROUND 359 (#24513)
- **ADDITION 1 — collected:** every row with **no company** in a delete schema — `accounting.expense_lines` **506**, `accounting.bill_lines` **28**, `dispatch.load_charge_lines` **136** (= 670 rows). They are in the plan counts below.
- **ADDITION 2 — proven:** after the delete, same transaction, every delete-schema table must have **0 rows with no company**, else `ROWS ESCAPED THEIR COMPANY: <table> has <n> row(s) … — rolled back`.
- **Preserved schemas untouched:** a company-less row in mdata / catalogs / identity / org / banking / preserve / audit / lib is **never collected**. The only ones that exist are shared by design and are listed KEPT with their reason; anything else would be a BLOCKER (there is none).
- **No local 13515 exclusion exists** in any checkout on this machine — the script is identical to main everywhere. Nothing is excluded by hand.

## The ONE blocker for APPLY
`1000 Bank of America - Operating (USMCA)` moves by **15,239,411 cents ($152,394.11)** — the delete removes every posting on the bank account. APPLY refuses unless `ALLOW_BANK_EFFECT=1` is set **and the AUTH names it**. Bank lines themselves are KEPT and go back to For Review (553 matched expense links cleared).

## Ledger
USMCA before: **DR 217,802,925 = CR 217,802,925**, 0 unbalanced JEs. Removed by the plan: **DR 217,802,925 = CR 217,802,925** — the whole ledger, netting to zero. After APPLY the proof requires GL postings **0**.

## Full plan output (verbatim)
```


MODE: DRY RUN — read-only plan, nothing written
SCOPE zero-reset — PLAN (delete order, deepest first):
  geo.geofence_state_transitions                          1418
  accounting.credit_memos                                 0
  accounting.vendor_credits                               0
  accounting.broker_advances                              0
  accounting.deposits                                     0
  driver_finance.driver_advances                          12
  dispatch.load_id_reservations                           0
  dispatch.load_abandonments                              0
  dispatch.intransit_issues                               0
  dispatch.customer_notify_preferences                    0
  dispatch.notify_log                                     0
  dispatch.load_assignment_history                        174
  dispatch.cargo_sensor_incidents                         0
  dispatch.late_arrival_aggregates                        10
  dispatch.detention_evidence                             0
  dispatch.trailer_interchanges                           2
  dispatch.load_charge_lines                              284
  dispatch.auto_status_suggestion_responses               0
  dispatch.ratecon_extractions                            0
  dispatch.manual_delivery_authorizations                 0
  dispatch.load_templates                                 0
  dispatch.bol_documents                                  0
  dispatch.ocr_intake_queue                               0
  dispatch.load_cancellations                             16
  accounting.bill_lines                                   118
  accounting.expense_lines                                1070
  expense_attribution.expense_load_links                  1237
  expense_attribution.expense_seq_per_load                115
  driver_finance.deduction_schedule                       7
  accounting.payment_applications                         8
  accounting.escrow_postings                              183
  accounting.ar_collection_tasks                          1
  fuel.fraud_alerts                                       44
  dispatch.driver_layovers                                52
  driver_finance.driver_settlement_gl_bills               90
  driver_finance.escrow_ledger                            116
  driver_finance.payrun_gl_runs                           47
  accounting.load_revenue_recognition_postings            251
  driver_finance.presettlement_link_suggestions           25
  accounting.company_settlement_driver_settlements        51
  geo.geofence_vehicle_state                              656
  telematics.load_odometer_segments                       203
  driver_finance.settlement_line_item_splits              31
  fuel.tank_state                                         13
  fuel.fuel_transaction_derivations                       263
  telematics.unit_stop_events                             534
  accounting.transaction_source_links                     4355
  docs.file_links                                         587
  accounting.bill_payments                                130
  accounting.payments                                     7
  accounting.company_settlements                          51
  driver_finance.driver_liabilities                       12
  dispatch.detention_requests                             0
  dispatch.non_owned_trailers                             4
  dispatch.pod_documents                                  0
  dispatch.auto_status_suggestions                        0
  accounting.journal_entry_postings                       7909
  driver_finance.driver_settlement_gl_runs                45
  fuel.tank_events                                        161
  accounting.bills                                        93
  dispatch.detention_events                               0
  accounting.invoice_lines                                106
  accounting.invoices                                     111
  dispatch.stop_arrivals                                  8
  accounting.factoring_advances                           0
  mdata.load_stops                                        382
  mdata.loads                                             150
  accounting.journal_entries                              3734
  accounting.expenses                                     553
  driver_finance.driver_bills                             136
  driver_finance.driver_settlements                       64
  driver_finance.settlement_lines                         355
  driver_finance.driver_reimbursements                    0
  driver_finance.driver_settlement_deductions             67
  fuel.fuel_transactions                                  323
  docs.files                                              302
  ~ ESCAPED accounting.bill_lines: 28 row(s) with NO company collected for deletion
  ~ ESCAPED accounting.expense_lines: 506 row(s) with NO company collected for deletion
  ~ KEPT audit.row_changes: 160147 row(s) with no company — shared by design (audit of company-less tables), never deleted
  ~ KEPT audit.scenario_status: 697466 row(s) with no company — shared by design (global scenario status), never deleted
  ~ KEPT catalogs.detail_types: 144 row(s) with no company — shared by design (QuickBooks detail-type catalog shared by all companies), never deleted
  ~ ESCAPED dispatch.load_charge_lines: 136 row(s) with NO company collected for deletion
  ~ KEPT identity.role_permissions: 30 row(s) with no company — shared by design (global role -> permission map), never deleted
  ~ KEPT lib.feature_flag_overrides: 2 row(s) with no company — shared by design (a NULL-company override applies to every company), never deleted
LEDGER (USMCA) before: DR 217802925 CR 217802925 unbalanced JEs 0; removed by plan: DR 217802925 CR 217802925 (must be equal)
  operational row kept, link cleared: safety.dvir_submissions.load_id — 150 parent id(s)
  bank line kept, unlinked: banking.bank_transactions.matched_expense_id — 553 parent id(s)
  child rows deleted by FK: fuel.load_fuel_cost.load_id — 150 parent id(s)
  operational row kept, link cleared: downtime.events.preceding_load_id — 150 parent id(s)
  operational row kept, link cleared: downtime.events.following_load_id — 150 parent id(s)
  operational row kept, link cleared: banking.reconciliation_sessions.service_charge_journal_entry_id — 3734 parent id(s)
  operational row kept, link cleared: banking.reconciliation_sessions.interest_earned_journal_entry_id — 3734 parent id(s)
  child rows deleted by FK: integrations.samsara_route_stop_progress.load_id — 150 parent id(s)
  child rows deleted by FK: integrations.samsara_route_stop_progress.stop_id — 382 parent id(s)
  operational row kept, link cleared: banking.reconciliation_sessions.service_charge_expense_id — 553 parent id(s)
BALANCE EFFECT of the delete (net DR removed per account; every other account nets 0):
  4000 Freight / Line-haul Income                    -46056072
  1100 Accounts Receivable (A/R)                     35333412
  5000 Fuel & Diesel                                 17396210
  1000 Bank of America - Operating (USMCA)           15239411  <- BANK
  1090 Undeposited Funds                             -15173634
  2510 Dreamline Diesel Card Payable                 -14119723
  1150 Unbilled Revenue                              9571900
  6890 Cost of Labor–Mexico Drivers                  7417094
  2170 Driver Net-Pay Clearing                       -7121596
  1295 Relay Fuel Wallet                             -3383980
  5010 DEF (Diesel Exhaust Fluid)                    694310
  4200 Accessorial / Detention Income                -400000
  2000 Accounts Payable (A/P)                        -354298
  5310 Lumper Expense                                298025
  9000 Ask My Accountant                             297663
  5500 Tires                                         266552
  5100 Driver Pay / Settlements                      119000
  7200 Driver Admin Fee & Chargeback Income          -95225
  5400 Truck Repairs & Maintenance                   74341
  5320 Trailer Washout                               74208
  5300 Tolls & Scales                                55406
  2100-00-023 GENARO GUERRERO CHAVEZ — Driver Escrow -27500
  2100-00-040 Leonel Antonio Morales — Driver Escrow -27500
  2100-00-026 JOSE ANTONIO VICENTE MARTINEZ — Driver Escrow -25000
  2100-00-024 ANGEL ALFONSO SOSA — Driver Escrow     -17500
  2100-00-022 HUGO GAYTAN — Driver Escrow            -15000
  2100-00-027 Jorge Luis Infante Corona — Driver Escrow 15000
  2100-00-001 LUIS ARMANDO SOSA PEREZ — Driver Escrow -15000
  2100-00-008 PEDRO ABRAHAM LOPEZ COLLADO — Driver Escrow -10000
  2100-00-041 Carlos Mauricio Pena Carvallo — Driver Escrow -10000
  2100-00-006 ALFONSO HIDALGO CHAVEZ — Driver Escrow -7500
  2100-00-002 Neftali Coronado Urbano — Driver Escrow 5000
  2175-00-006 JOSE ANTONIO VICENTE MARTINEZ — Driver Reimbursements -4932
  6160 Parts & Supplies Expense                      4428
  2100-00-004 Rafael Rogelio Rivero Reynoso — Driver Escrow 2500
  6300 Bank Service Charges & Wire Fees              500
  7100 Interest Income                               -500
  ! BLOCKER bank account 1000 Bank of America - Operating (USMCA) would change by 15239411 cents — a deletion that moves a bank balance needs ALLOW_BANK_EFFECT=1 under an AUTH that names it
```

## Notes for the owner's decision
- The 136 `dispatch.load_charge_lines` with no company point at 132 loads that no longer exist; their company cannot be read from anywhere live. They are collected by the ROUND 359 rule (every company-less row in a delete schema).
- Driver escrow: the plan removes every escrow posting (GL), and `driver_finance.escrow_ledger` (116). `driver_finance.escrow_balances` is a hub table the reset does not touch — after APPLY it will still show the pre-reset balances while the GL shows zero. Say whether escrow balances reset with the purge (one decision; nothing assumed here).
- After APPLY: the NOT NULL on `bill_lines` / `expense_lines` / `load_charge_lines` ships (CC-1 migration 202615350100, reworked per ROUND 359 — no stamp), and `verify-no-row-escapes-its-company` runs unscoped at ceiling 0.
