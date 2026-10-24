# Main static reds NOT in VERIFY-STATIC-BASELINE — measured 10-23-2026 8:35 PM CT (Lead, full verify:static on main + Lead 443.285, 6264 guards)

Each seat: root cause + fix the code or retarget the guard to the approved V3 board contract WITH a failing plant. Never baseline, never edit a guard to pass without a plant. One PR per area, hooks on, fast-merge, sha on the bus.

LEAD takes (out of CC-1's list): verify-bank-transactions-direction-uses-is-credit (fixed in Lead 443.283b), verify-actual-vs-projected-tab-uses-paritytable, verify-cash-flow-adjustment-add-chrome-law, verify-mdp-panel-proportion. verify-analytical-dashboard-surface-connectivity stays CC-2 (443.284). CI on main fails first at verify:arch-design (Cursor 443.289) — once that is green, CI reaches these; every one must be 0 or main stays red for every PR.

## CC-1 (43)
- verify-accounting-existing-query-reverse-drills.mjs — apps/frontend/src/pages/CustomerDetail.tsx — --selftest failed:
- verify-accounting-subnav-click-reachability.mjs — apps/frontend/src/pages/accounting/__tests__/accounting-subnav-click-reachability.test.tsx — spawn: spawnSync /opt/homebrew/Cellar/node/26.3.0/bin/node ETIMEDOUT
- verify-acct-ensure-driver-vendors.mjs — apps/backend/src/mdata/vendors.routes.ts — --selftest failed: FAIL: selftest legacy normalization mutation stayed green
- verify-actual-vs-projected-tab-uses-paritytable.mjs — apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx — - apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx: must import V3 from design/v3-tokens
- verify-analytical-dashboard-surface-connectivity.mjs — apps/frontend/src/pages/cash-flow/CashFlowPage.tsx — analytical dashboard surface connectivity guard failed:
- verify-ap-aging-no-dup-search.mjs — apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx — --selftest failed: verify-ap-aging-no-dup-search FAIL — selftest expected FAIL when Search vendor returns to by-vendor filterBar
- verify-bank-transactions-direction-uses-is-credit.mjs — apps/backend/src/cash-flow/cash-flow-bank-actuals.sql.ts — - apps/backend/src/cash-flow/cash-flow-bank-actuals.sql.ts: a banking.bank_transactions query compares amount_cents against 0 for direction
- verify-cash-flow-adjustment-add-chrome-law.mjs — apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx — - adjustment button must read 'Create' next to the Plus icon
- verify-customers-reverse-link-detail.mjs — apps/frontend/src/pages/CustomerDetail.tsx — - loads producer returns canonical trailer id and label; --selftest failed
- verify-driver-bill-miles-basis-numeric.mjs — apps/backend/src/dispatch/book-load.service.ts — - INSERT site #1 does not bind the bare milesBasis identifier as a VALUES param; --selftest failed
- verify-driver-pay-practical-fallback-locked.mjs — apps/backend/src/dispatch/book-load.service.ts — verify-driver-pay-practical-fallback-locked FAILED:
- verify-driver-phone-login-link-cas.mjs — apps/backend/src/mdata/drivers.routes.ts — --selftest failed: SELFTEST FAIL verify-driver-phone-login-link-cas: caught 5/6; missed 2
- verify-entity-picker-registry-honest-labels.mjs — apps/frontend/src/components/parity/entityPickerRegistry.ts — driver does not use its exact honest-label contract; --selftest failed
- verify-every-balance-surface-declares-cleared-and-uncleared.mjs — apps/frontend/src/pages/factoring/FactoringHome.tsx — apps/frontend/src/pages/factoring/FactoringHome.tsx: missing cleared declaration
- verify-export-business-date.mjs — apps/frontend/src/pages/customers/CustomersListView.tsx — --selftest failed: if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
- verify-factoring-customer-retention-human-labels.mjs — apps/frontend/src/pages/factoring/FactoringHome.tsx — --selftest failed: verify-factoring-customer-retention-human-labels SELFTEST FAILED: planted defect not caught
- verify-factoring-home-canonical-factor-profile.mjs — apps/frontend/src/pages/factoring/FactoringHome.tsx — [verify-factoring-home-canonical-factor-profile] FAIL: honest no-factor state must remain visible; --selftest failed
- verify-factoring-settlement-number-real-join.mjs — apps/backend/src/accounting/load-cost-rollup.sql.ts — - apps/backend/src/accounting/load-cost-rollup.sql.ts: could not find the settlement_number subquery (source_document_ref).
- verify-legal-contracts-filed-as-pdf.mjs — apps/backend/src/legal/contracts.service.ts — - live: DATABASE_URL not set — unfiled contracts were not counted, and an unread count is not a pass
- verify-liability-required-honest-cluster-a-genuine.mjs — apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx — - apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx: must read settlement.liability_ids
- verify-load-cancel-void-cascade.mjs — apps/backend/src/dispatch/cancellation.service.ts — [verify-load-cancel-void-cascade] FAILED — 1 issue(s):; --selftest failed
- verify-load-costs-board-trailer-unit-columns.mjs — apps/backend/src/accounting/load-costs-board.routes.ts — --selftest failed: throw new Error(`selftest mutation ${index + 1} escaped detection`);
- verify-load-miles-match-settlement-document.mjs — apps/backend/src/dispatch/mileage/miles-recommendations.service.ts — verify-load-miles-match-settlement-document: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money gu
- verify-load-report-and-picker-scope.mjs — apps/backend/src/reports/loads-report.service.ts — verify-load-report-and-picker-scope: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that
- verify-maint-bill-factoring-liab-built.mjs — apps/frontend/src/components/accounting/VendorBillForm.tsx — - PreSettlementsPanel must keep reading settlement.liability_ids (real driver_finance.driver_liabilities FK, not a fabricated id)
- verify-mdata-deactivate-rls-bypass-wrap.mjs — apps/backend/src/mdata/customers.routes.ts — --selftest failed: FAIL(selftest): offender mutation did not change customers.routes.ts — pattern out of sync
- verify-mdp-panel-proportion.mjs — apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx — FAIL verify-mdp-panel-proportion: ROUND 443.250 must mount V3KpiTile; --selftest failed
- verify-parity-export-computed-column-blank.mjs — apps/frontend/src/components/parity/ParityTable.tsx — --selftest failed: FAIL(selftest): planted offender (ParityTable exportCsv reverted) was NOT caught
- verify-proportion-chrome-modal-drawer-density.mjs — apps/frontend/src/components/parity/sizing.ts — - sizing.ts must keep fieldHeightPx: 38; --selftest failed
- verify-reassign-moves-open-driver-bill.mjs — apps/backend/src/dispatch/book-load.service.ts — R3: a non-open / settled bill whose driver would change is not refused by name (DriverBillReassignRefusedError); --selftest failed
- verify-reimbursement-per-type-gl.mjs — apps/backend/src/accounting/coa-roles/resolver.service.ts — verify-reimbursement-per-type-gl FAILED:
- verify-reports-account-type-human-labels.mjs — apps/frontend/src/lib/formatAccountTypeLabel.ts — --selftest failed: verify-reports-account-type-human-labels FAIL: selftest could not plant raw TrialBalance account_type
- verify-reports-qbo-chrome-leaves.mjs — apps/frontend/src/components/reports/CategoryHoverNav.tsx — - ReportsHome missing the honest KPI no-fabrication guarantee; --selftest failed
- verify-round-trips-full-tour.mjs — apps/backend/src/mdata/loads.routes.ts — --selftest failed: AssertionError [ERR_ASSERTION]: selftest fixture out of sync with the real open-settlement scope
- verify-rpt-s06-scheduled-honest-zero.mjs — apps/frontend/src/pages/reports/ReportsHome.tsx — - apps/frontend/src/pages/reports/ReportsHome.tsx: Run last 7 days KPI must use kpiReady ? real count : "—"
- verify-settlement-creator-driver-pay-independent-of-invoice.mjs — apps/backend/src/driver-finance/settlement-creator.service.ts — --selftest failed: verify-settlement-creator-driver-pay-independent-of-invoice SELFTEST FAILED:
- verify-settlement-detail-identity-guard.mjs — apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx — --selftest failed: verify-settlement-detail-identity-guard --selftest FAIL bad1-guard-removed: mutation not caught
- verify-settlement-fe-honesty.mjs — apps/frontend/src/pages/driver-finance/SettlementsPage.tsx — [verify-settlement-fe-honesty] FAILED:
- verify-settlement-list-display-id.mjs — apps/backend/src/driver-finance/settlements.routes.ts — [verify-settlement-list-display-id] FAILED:
- verify-settlements-grid-honest-labels.mjs — apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx — [verify-settlements-grid-honest-labels] FAIL: pre-settlement Period Begin column must format its own date; pre-settlement Period End column
- verify-settlements-module-one-readout.mjs — apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx — - SettlementsPage must keep payments|tours view mapping (payments opt-in / own tab); --selftest failed
- verify-truck-one-in-motion-plus-advance.mjs — apps/backend/src/dispatch/unit-active-load-guard.ts — verify-truck-one-in-motion-plus-advance: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard
- verify-void-source-linked-reads-full-je.mjs — apps/backend/src/accounting/void.service.ts — --selftest failed: verify-void-source-linked-reads-full-je: FAIL — --selftest could not plant source-only regression

## CC-2 (8)
- verify-bank-f10-overage-queue-ui.mjs — apps/frontend/src/pages/fuel/FuelHome.tsx — - apps/frontend/src/pages/fuel/FuelHome.tsx must distinguish unresolved overage count from a true zero; --selftest failed
- verify-banking-cash-kpi-cents-unit.mjs — apps/frontend/src/pages/banking/BankingHome.tsx — ✗ apps/frontend/src/pages/banking/BankingHome.tsx: no cashPosting selector reads total_cash — re-point this guard at the live KPI derivation
- verify-banking-escrow-settlement-linkage.mjs — apps/backend/src/banking/escrow-visualizer.routes.ts — --selftest failed: if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
- verify-c1-3-button-targets-routed.mjs — apps/frontend/src/pages/fuel/FuelHome.tsx — ✗ Fuel Home → Fraud Alerts: apps/frontend/src/pages/fuel/FuelHome.tsx no longer links to any of [to="/fuel/fraud-alerts"] (button would dead
- verify-fuel-create-async-lifecycle.mjs — apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx — verify-fuel-create-async-lifecycle FAIL — drawer and Cancel safely register shared dirty-confirmation boundary, stale success cannot toast,
- verify-fuel-upload-async-lifecycle.mjs — apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx — verify-fuel-upload-async-lifecycle FAIL — transactions selected file is not safely confirm-protected across dismiss paths, transactions curr
- verify-fuel-upload-creator-draft-lifecycle.mjs — apps/frontend/src/pages/fuel/components/ImportFuelTransactionsModal.tsx — verify-fuel-upload-creator-draft-lifecycle FAIL — transactions modal dismiss resets, transactions clean success resets while rejected-row ev
- verify-r441-banking-modal-close-cc-vendor.mjs — apps/frontend/src/pages/banking/components/MatchDrawer.tsx — 2 R441 C1–C4 assertion(s) failed; --selftest failed

## CC-3 (19)
- verify-claude-green-evidence-shape.mjs — - — verify-claude-green-evidence-shape FAILED — tip commit is not Claude-green (Rule 30):
- verify-customer-reclassification-history-scope.mjs — apps/backend/src/mdata/reclassify.routes.ts — --selftest failed: verify-customer-reclassification-history-scope SELFTEST FAIL: inert mutations: drop company context
- verify-dispatch-planner-safety-entitylink.mjs — apps/backend/src/safety/driver-scheduler.service.ts — --selftest failed: verify-dispatch-planner-safety-entitylink SELFTEST FAIL: planted single-view EntityLink defect not caught []
- verify-document-status-vocabulary.mjs — apps/backend/src/lib/document-status-vocabulary.ts — verify-document-status-vocabulary: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that c
- verify-driver-profile-default-truck-symmetry.mjs — apps/backend/src/mdata/unit-default-driver.routes.ts — verify:driver-profile-default-truck-symmetry FAIL: driver current-load reverse must exclude every terminal load status; --selftest failed
- verify-event-log-spine.mjs — apps/backend/src/x.ts — [verify-event-log-spine] FAIL: DATABASE_URL not set — the live half cannot run (a guard that cannot connect fails, never passes)
- verify-every-graphic-number-clicks-through.mjs — - — Static contract only. Route existence, applied filters, and matching totals require live read-back.
- verify-fleet-bulk-update-all-or-nothing.mjs — apps/backend/src/bulk/bulk-update.factory.ts — --selftest failed: [verify-fleet-bulk-update-all-or-nothing] SELFTEST FAIL: factory 409 mutation survived
- verify-fuel-load-covers-fill-time.mjs — - — verify-fuel-load-covers-fill-time: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that c
- verify-go20-b-predictive-alerts-wired.mjs — apps/backend/src/jobs/predictive-alerts-worker.ts — [verify-go20-b-predictive-alerts-wired] FAILED — 2 check(s) regressed:
- verify-home-fleet-utilization-excludes-sample-data.mjs — apps/backend/src/home/home-widgets.routes.ts — - apps/backend/src/home/home-widgets.routes.ts: the fleet-utilization active-units query not found (re-anchor); --selftest failed
- verify-item-income-account-required.mjs — apps/backend/src/catalogs/items.routes.ts — --selftest failed: verify-item-income-account-required SELFTEST FAILED:
- verify-no-orphan-of-purged-documents.mjs — - — - live: DATABASE_URL not set — orphans were not counted, and an unread count is not a pass
- verify-parity-table-footer-follows-columns.mjs — - — spawn: spawnSync /opt/homebrew/Cellar/node/26.3.0/bin/node ETIMEDOUT
- verify-safety-complaints-range-vertical.mjs — apps/backend/src/routes/safety/complaints.ts — --selftest failed: FAIL selftest: missing mutation anchor api:params: { driver_id?: string; customer_id?: string; user_id?: string; limit?:
- verify-safety-complete-driver-roster-vertical.mjs — apps/frontend/src/api/catalog-drivers.ts — verify-truck-planner-complete-unit-roster PASS — Truck Planner schedules the complete scoped unit master with OOS/error truth; --selftest fa
- verify-safety-hos-violations-range-vertical.mjs — apps/backend/src/routes/safety/hos-violations.ts — --selftest failed: FAIL selftest: mutation survived driverPage:<DriverHosViolationsReverseSection
- verify-settled-load-stops-carry-the-document.mjs — apps/backend/src/telematics/stops-geocode-backfill.service.ts — verify-settled-load-stops-carry-the-document: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money g
- verify-uuid-text-join-casts.mjs — - — Fix: cast the uuid side, e.g. v.id::text = b.vendor_id. Never <text>::uuid.

## Cursor (21)
- verify-91133-dispatch-planners-slate-leftover-chrome.mjs — apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx — - apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx: leftover slate class
- verify-appointments-required-on-book.mjs — apps/frontend/src/pages/dispatch/components/BookLoadStopsSection.tsx — spawn: spawnSync /opt/homebrew/Cellar/node/26.3.0/bin/node ETIMEDOUT
- verify-bank-surf-01-dod.mjs — apps/frontend/src/routes/manifest.tsx — - NEVER-DELETE: BankingHome Accounts tab must reference escrowFeed
- verify-book-load-money-and-controls.mjs — apps/frontend/src/components/dispatch/accessorial-editor-lib.ts — if (errors.length) throw new Error(errors.join("; "));; --selftest failed
- verify-dispatch-board-live-history.mjs — apps/frontend/src/api/loads.ts — FAIL verify-dispatch-board-live-history: listLoadsQuerySchema must accept board_scope live|history; --selftest failed
- verify-dispatch-board-unassigned-units-error-state.mjs — apps/frontend/src/pages/dispatch/DispatchBoard.tsx — verify-dispatch-board-unassigned-units-error-state FAIL — 1 problem(s):; --selftest failed
- verify-dispatch-load-create-picker-law.mjs — apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx — --selftest failed: verify-dispatch-load-create-picker-law SELFTEST FAIL — stop-native-date
- verify-dispatch-mapview-honest.mjs — apps/frontend/src/pages/dispatch/MapView.tsx — - apps/frontend/src/pages/dispatch/MapView.tsx: must match positions to focused driver
- verify-factoring-nav-reachable.mjs — apps/frontend/src/components/layout/NavyPageSubNav.tsx — spawn: spawnSync /opt/homebrew/Cellar/node/26.3.0/bin/node ETIMEDOUT
- verify-factoring-package-popup-block-honesty.mjs — apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx — --selftest failed: verify-factoring-package-popup-block-honesty SELFTEST FAIL — revert pattern did not match source, re-anchor
- verify-faro-kpi-strip.mjs — apps/frontend/src/router/route-manifest.ts — --selftest failed: verify-faro-kpi-strip --selftest: mutation "a duplicate value" did not change the source — fixture drifted
- verify-kanban-cross-column-drag-wired.mjs — apps/frontend/src/components/dispatch/DispatchKanban.tsx — --selftest failed: else throw new Error(`selftest failed to catch: ${name}`);
- verify-no-partial-optional-chain.mjs — apps/frontend/src/components/ErrorBoundary.tsx — [verify-no-partial-optional-chain] FAILED — 2 partial optional chain(s):; --selftest failed
- verify-planner-grid-canonical.mjs — apps/frontend/src/pages/dispatch/planners/UnifiedTimelinePlanner.tsx — - A5_TRACK_HAS_NO_AVAILABLE_TEXT: pg-track renderer not found; --selftest failed
- verify-planner-load-templates.mjs — apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx — - A5_TRACK_HAS_NO_AVAILABLE_TEXT: pg-track renderer not found; --selftest failed
- verify-planners-layout.mjs — apps/frontend/src/pages/dispatch/planners/PlannerGrid.tsx — --selftest failed: if (!changed) throw new Error(`selftest mutate() was a no-op for: ${name}`);
- verify-pre-settlement-panel-labels.mjs — apps/frontend/src/components/dispatch/PreSettlementPanel.tsx — FAIL: driver-finance/PreSettlementsPanel does not use formatDateUS
- verify-predispatch-panel-mounted.mjs — apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx — --selftest failed: FAIL verify-predispatch-panel-mounted: selftest mutation survived: failure reports passing
- verify-quick-assign-unit-linkage.mjs — apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx — - unit current-load reverse must exclude every terminal load state, including closed; --selftest failed
- verify-truck-line-exhaust-fits-its-viewbox.mjs — apps/frontend/src/pages/dispatch/TruckLineBoard.tsx — - the viewBox height (26) and the svg height (46) must match, or the drawing scales; --selftest failed
- verify-unselected-boxes-are-not-pure-white.mjs — apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx — verify-unselected-boxes-are-not-pure-white: FAIL — 2 finding(s); 1 white unselected box(es) over 1547 files.

## Codex (16)
- verify-driver-profile-dead-actions.mjs — apps/frontend/src/components/driver-profile/ActionBar.tsx — [verify-driver-profile-dead-actions] FAILED:
- verify-fleet-fault-summary-exact-counts.mjs — apps/backend/src/maintenance/fault-auto-wo/fault-history.routes.ts — --selftest failed: if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
- verify-fleet-fault-summary-read-recovery.mjs — apps/frontend/src/pages/fleet/VehicleProfilePage.tsx — --selftest failed: selftest mutation 1 escaped
- verify-fleet-table-failure-exclusion.mjs — apps/frontend/src/pages/maintenance/FleetTablePage.tsx — --selftest failed:
- verify-insurance-landing-no-overflow.mjs — apps/frontend/src/pages/insurance/InsuranceLanding.tsx — [verify-insurance-landing-no-overflow] FAILED — 5 issue(s):
- verify-maint-pm-transit-fault-slate-leftover-chrome.mjs — apps/frontend/src/pages/maintenance/components/MaintenancePmCountdownCards.tsx — - apps/frontend/src/pages/maintenance/components/MaintenancePmCountdownCards.tsx: leftover slate class
- verify-maintenance-pm-countdown-failure-exclusion.mjs — apps/frontend/src/pages/maintenance/MaintenanceHome.tsx — AssertionError [ERR_ASSERTION]: compact successful countdown remains wired; --selftest failed
- verify-operational-context-record-links.mjs — apps/frontend/src/components/vehicle-profile/CurrentLoadSection.tsx — operational context record-link guard failed:
- verify-road-service-ticket-create-result.mjs — apps/backend/src/maintenance/road-service/tickets.routes.ts — --selftest failed: verify-road-service-ticket-create-result selftest mutation escaped: { config: { rateLimit: { max: 60, timeWindow: "1 minu
- verify-safety-action-datepicker-label-wrappers.mjs — apps/frontend/src/pages/safety/TrainingRecordsPage.tsx — --selftest failed: try { const planted = original.replace('<div className="block text-xs text-slate-600">\n            <label htmlFor="train
- verify-safety-civil-fines-reverse-range.mjs — apps/frontend/src/api/safety.ts — --selftest failed: FAIL selftest: mutation survived driverProfile:<DriverFinesReverseSection
- verify-safety-datepicker-label-wrappers.mjs — apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx — --selftest failed: if (result.status === 0) throw new Error("planted wrapping-label defect did not redden guard");
- verify-safety-expiry-tracking-coverage.mjs — apps/backend/src/safety/driver-profile.routes.ts — --selftest failed: verify:safety-expiry-tracking-coverage FAILED
- verify-safety-filter-datepicker-label-wrappers.mjs — apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx — --selftest failed: try { const planted = original.replace('<div className="text-xs text-slate-600">\n            <label htmlFor="drug-alcoho
- verify-settlement-sweep-pre-list.mjs — apps/frontend/src/pages/Drivers.tsx — throw new Error("Standalone Pre-Settlements must use the complete company-scoped open list, not the capped payment-ready preview");; --selft
- verify-wo-time-arriving-slate-leftover-chrome.mjs — apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx — - apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx: leftover slate class

TOTAL 107
