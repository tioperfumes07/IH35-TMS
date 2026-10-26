# FINAL-4 — main's 149 red static guards (+22 unwired), measured 10-25-2026 7:55 PM CT on origin/main

`node scripts/verify-static.mjs` on main: PASS 5762 · FAIL-test(gated) 149 · FAIL-test(unwired) 22 · EXCLUDED-live-db 340.
Nobody saw them because every seat fast-merges with --no-verify. Row 201 = this. Owner law still applies (fast 4-minute merge, coding only).

## The rule for every red guard (no exceptions)
1. Run it: `node scripts/<guard>.mjs` and `--selftest`.
2. If the CODE regressed (the guard names a real defect — money, void, linkage, honesty): FIX THE CODE. That is the default assumption.
3. Only if an owner-approved rebuild changed the structure the guard pins (e.g. a V3 board rebuild moved a component): update the guard to assert the NEW correct contract and keep a selftest that plants the original defect. Say which owner order/PR made it stale.
4. NEVER delete a guard, weaken a regex to match anything, raise a ceiling, or add to a baseline to go green.
5. One PR per 3-6 guards, fast-merge, list the guards turned green (pasted PASS lines) in the body.

Your lane is below. Run `node scripts/verify-static.mjs` at the end of your lane; report "<SEAT> FINAL-4 DONE" + PRs.

## LEAD — gates-infra (40)
- verify-module-completion.mjs — spawn: spawnSync /opt/homebrew/Cellar/node/26.3.0/bin/node ETIMEDOUT
- verify-additive-only.mjs — with --regenerate and OWNER_REMOVE_LINE set to that exact line.
- verify-bus-diet-outbox-cap.mjs — - OUTBOX-CURSOR.md: 461 > OUTBOX_CAP 200; --selftest failed
- verify-claude-green-evidence-shape.mjs — verify-claude-green-evidence-shape FAILED — tip commit is not Claude-green (Rule 30):
- verify-company-membership-assert.mjs — verify-company-membership-assert FAILED:
- verify-disp-wire-10-cancel-economics.mjs — - apps/backend/src/dispatch/cancellation.service.ts: cancellation must void open driver bills in-cascade (owner ruling 2026-09-01) — not leave them as orphaned open payables on a cancelled load; --selftest failed
- verify-docs-entity-labels.mjs — - DocsHome must pass only a resolved human label to EntityLink; --selftest failed
- verify-document-status-vocabulary.mjs — apps/backend/src/accounting/bills.routes.ts: missing register filter contract: query.data.vendor_id ?? null]; --selftest failed
- verify-event-log-spine.mjs — [verify-event-log-spine] FAIL: DATABASE_URL not set — the live half cannot run (a guard that cannot connect fails, never passes)
- verify-every-graphic-number-clicks-through.mjs — Static contract only. Route existence, applied filters, and matching totals require live read-back.
- verify-form-field-roundtrip.mjs — ✗ apps/frontend/src/components/bulk/BulkActionModal.tsx:80  <input onChange> field state 'typedConfirm' (declared L35) never reaches a submit payload — the operator's entry is silently discarded.
- verify-google-oauth-lazy-env.mjs — verify:google-oauth-lazy-env failed: missing file /Users/jorgemunoz/IH35-TMS-lead291/dist/auth/lucia.js
- verify-guard-selftests-are-real.mjs — verify-guard-selftests-are-real FAILED — 12 guard(s) have NO --selftest arm and are not on the baseline:
- verify-hold-merge-gate.mjs — live GitHub ruleset identity does not match active repository ruleset tioperfumes07/IH35-TMS#17935054
- verify-honest-built-launch-law-present.mjs — - docs/bus/INBOX-CURSOR.md (does not cite HONEST-BUILT-LAUNCH-LAW-2026-08-14)
- verify-insurance-landing-no-overflow.mjs — [verify-insurance-landing-no-overflow] FAILED — 5 issue(s):
- verify-join-entity-scoped.mjs — ✗ 60 NEW entity-unscoped JOIN(s) — the shape that puts another entity's driver/unit on a legal or money record:; --selftest failed
- verify-legal-contracts-filed-as-pdf.mjs — - live: DATABASE_URL not set — unfiled contracts were not counted, and an unread count is not a pass
- verify-live-document-predicates-single-source.mjs — new inline debt apps/backend/src/reports/vendor-report.service.ts:e567f324d6d6686fd902 (1)
- verify-matrix-built-leaf-specific.mjs — - scripts/verify-settlement-sweep-pre-list.mjs: broad leafRe=".*" Built claim for col(s) connectivity (shorthand)
- verify-mdata-deactivate-rls-bypass-wrap.mjs — --selftest failed: FAIL(selftest): offender mutation did not change customers.routes.ts — pattern out of sync
- verify-no-boot-throwing-env-checks.mjs — verify:no-boot-throwing-env-checks failed: dist root not found at /Users/jorgemunoz/IH35-TMS-lead291/dist
- verify-no-dead-kpi-cards.mjs — - HONEST-DISHONEST-ZERO: apps/frontend/src/pages/drivers/SettlementsDeductionsKpiRow.tsx:55 — `dollars += Number(s.deductions_total ?? 0);` — a missing/failed value renders as a confident 0; use null
- verify-no-negative-open-balance.mjs — verify-no-negative-open-balance: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruli
- verify-no-orphan-of-purged-documents.mjs — - live: DATABASE_URL not set — orphans were not counted, and an unread count is not a pass
- verify-no-selftest-mutates-tracked-source.mjs — ✗ scripts/verify-econ-012-expense-category-map-align.mjs:129 — writeFileSync(edAbs, ...) targets tracked source under apps/ or packages/. Copy the target to a temp path first (mkdtempSync/os.tmpdir())
- verify-no-silent-db-skip.mjs — export const ALLOW_OFFLINE_SKIP = "<one-line reason>"; to the file itself.
- verify-no-unauthorized-production-write.mjs — ✗ 2026-10-25-lead-load-trailer-type-from-evidence.mts
- verify-one-match-engine-owns-this-surface.mjs — - BankingTransactionsDesignView match panel must not use link-suggestion / obligation confidence; --selftest failed
- verify-person-names-normalized-at-write.mjs — ✗ HOS tracker detail drawer driver is not rendered through formatPersonName (apps/frontend/src/pages/compliance/HosTrackerSection.tsx); --selftest failed
- verify-recon-session-unmatch-resets-review-state.mjs — - apps/backend/src/accounting/bank-recon/unmatch-bank-transaction.service.ts: the unmatch writer clears every matched_*_id pointer but never resets review_state back to 'for_review' — the row is left
- verify-reports-dot-audit-pack-connectivity.mjs — --selftest failed:
- verify-reports-home-no-box-in-box.mjs — - apps/frontend/src/pages/reports/components/ReportsHomeBoard.tsx: must not nest bordered rounded-sm tiles (use V3Panel + table)
- verify-reports-scheduled-panel-canonical-source.mjs — --selftest failed: verify-reports-scheduled-panel-canonical-source SELFTEST FAIL — pattern did not match source, re-anchor: {"key":"home","from":"        <ScheduledReportsPanel />","to":"        <ScheduledReportsPanel r
- verify-required-surface-inventory-complete.mjs — reports.panel.simple_category ← pages/reports/components/ReportsHomeBoard.tsx; --selftest failed
- verify-road-service-ticket-create-result.mjs — --selftest failed: verify-road-service-ticket-create-result selftest mutation escaped: { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
- verify-round-trips-full-tour.mjs — --selftest failed: AssertionError [ERR_ASSERTION]: selftest fixture out of sync with the real open-settlement scope
- verify-rpt-s01-s05-reports-home-ifta.mjs — [verify-rpt-s01-s05-reports-home-ifta] FAILED:; --selftest failed
- verify-selftests-can-fail.mjs — verify-selftests-can-fail FAILED:; --selftest failed
- verify-subscription-manager-delivery-banner.mjs — --selftest failed: if (mutated === source) throw new Error(`mutation "${name}" did not change the source — test is inert`);

## CC-3 — dispatch-maint-safety-fleet (38)
- verify-91133-dispatch-planners-slate-leftover-chrome.mjs — - apps/frontend/src/pages/dispatch/planners/TruckPlanner.tsx: leftover slate class
- verify-d1-load-stop-source-attribution.mjs — verify-d1-load-stop-source-attribution FAIL: PWA arrival source; --selftest failed
- verify-disp-s27-s31-planners-pack.mjs — verify-disp-s27-s31-planners-pack FAILED:; --selftest failed
- verify-dispatch-board-live-history.mjs — FAIL verify-dispatch-board-live-history: listLoadsQuerySchema must accept board_scope live|history; --selftest failed
- verify-dispatch-board-unassigned-units-error-state.mjs — verify-dispatch-board-unassigned-units-error-state FAIL — 1 problem(s):; --selftest failed
- verify-dispatch-load-create-picker-law.mjs — --selftest failed: verify-dispatch-load-create-picker-law SELFTEST FAIL — stop-native-date
- verify-dispatch-load-status-filter-no-stale-tokens-systemwide.mjs — --selftest failed: TypeError: undefined is not iterable (cannot read property Symbol(Symbol.iterator))
- verify-dispatch-ocr-queue.mjs — --selftest failed: verify:dispatch-ocr-queue FAIL: selftest finalize lifecycle mutation escaped
- verify-dispatch-primary-inline-reverse-links.mjs — - backend: mounted list producer missing tr.equipment_number AS trailer_number
- verify-dispatch-qbo-chrome-leaves.mjs — - load.detail / load.drawer.overview / load.drawer.documents: LoadDetailDrawer real role=dialog + Overview/Documents tabs + DocumentsTab: pattern miss in apps/frontend/src/components/dispatch/LoadDeta; --selftest failed
- verify-driver-customer-hidden-surface-reverse-links.mjs — verify-driver-customer-hidden-surface-reverse-links: FAIL — HOS detail drawer drills to its driver; --selftest failed
- verify-driver-payment-methods-card-error-state.mjs — verify-driver-payment-methods-card-error-state FAIL — 1 problem(s):; --selftest failed
- verify-driver-payment-methods-card-parity-surface-bar.mjs — if (!cond) throw new Error(msg);; --selftest failed
- verify-driver-phone-login-link-cas.mjs — --selftest failed: SELFTEST FAIL verify-driver-phone-login-link-cas: caught 5/6; missed 2
- verify-driver-profile-dp2.mjs — --selftest failed: verify-driver-profile-dp2 SELFTEST FAIL — doubled DocumentsTab was not caught
- verify-entity-picker-load-kind-sweep.mjs — - apps/frontend/src/pages/dispatch/components/book-load-v4/LiveLoadIdBar.tsx: listLoads/listDispatchLoads outside allowlist — migrate to EntityPicker kind=load or add honest table-only allow; --selftest failed
- verify-fleet-counters-match-rows.mjs — --selftest failed: if (mutated === source || audit(mutated).length === 0) throw new Error(`planted defect ${index + 1} escaped`);
- verify-fleet-fault-summary-exact-counts.mjs — --selftest failed: if (verify(sources).length === 0) throw new Error(`selftest did not catch ${name}`);
- verify-fleet-fault-summary-read-recovery.mjs — --selftest failed: selftest mutation 1 escaped
- verify-fleet-roster-trailer-kind-wiring.mjs — --selftest failed: verify-fleet-roster-trailer-kind-wiring SELFTEST FAIL — kind-filter: mutation escaped
- verify-fleet-table-failure-exclusion.mjs — --selftest failed:
- verify-fleet-unit-roster-modals.mjs — --selftest failed: verify-fleet-unit-roster-modals SELFTEST FAIL — kind-filter-apply: mutation escaped
- verify-home-fleet-utilization-excludes-sample-data.mjs — - apps/backend/src/home/home-widgets.routes.ts: the fleet-utilization active-units query not found (re-anchor); --selftest failed
- verify-load-cancel-void-cascade.mjs — [verify-load-cancel-void-cascade] FAILED — 1 issue(s):; --selftest failed
- verify-load-costs-drawer-wide.mjs — - apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx: non-Costs tabs must keep md:w-[600px]; --selftest failed
- verify-load-report-and-picker-scope.mjs — verify-load-report-and-picker-scope: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner
- verify-maint-pm-transit-fault-slate-leftover-chrome.mjs — - apps/frontend/src/pages/maintenance/components/MaintenancePmCountdownCards.tsx: leftover slate class
- verify-maintenance-qbo-chrome-leaves.mjs — - driver_reports.queue: DriverReportsQueuePage real ParityTable + real visible EntityPicker filter: pattern miss in apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx; --selftest failed
- verify-mdata-load-create-trailer-equipment-default.mjs — --selftest failed: if (verify({ ...source, [key]: mutated }).length === 0) throw new Error(`${LABEL} SELFTEST mutation escaped: ${key} ${pattern}`);
- verify-planners-layout.mjs — --selftest failed: if (!changed) throw new Error(`selftest mutate() was a no-op for: ${name}`);
- verify-predispatch-panel-mounted.mjs — --selftest failed: FAIL verify-predispatch-panel-mounted: selftest mutation survived: failure reports passing
- verify-quick-assign-unit-linkage.mjs — - unit current-load reverse must exclude every terminal load state, including closed; --selftest failed
- verify-safety-action-datepicker-label-wrappers.mjs — --selftest failed: try { const planted = original.replace('<div className="block text-xs text-slate-600">\n            <label htmlFor="training-record-completed-date">Completed date</label>', '<label className="block te
- verify-safety-datepicker-label-wrappers.mjs — --selftest failed: if (result.status === 0) throw new Error("planted wrapping-label defect did not redden guard");
- verify-safety-expiry-tracking-coverage.mjs — --selftest failed: verify:safety-expiry-tracking-coverage FAILED
- verify-safety-filter-datepicker-label-wrappers.mjs — --selftest failed: try { const planted = original.replace('<div className="text-xs text-slate-600">\n            <label htmlFor="drug-alcohol-history-from">From</label>', '<label className="text-xs text-slate-600">\n
- verify-truck-line-exhaust-fits-its-viewbox.mjs — - the viewBox height (26) and the svg height (46) must match, or the drawing scales; --selftest failed
- verify-wave-a-load-all-modules.mjs — --selftest failed: verify-wave-a-load-all-modules SELFTEST FAIL — P10 mutation escaped

## CC-1 — accounting-settlements-cashflow (37)
- verify-accounting-autoload-coverage.mjs — verify:accounting-autoload-coverage FAIL: dist: no .js route files found under dist/accounting
- verify-accounting-qbo-chrome-modals-batch1.mjs — - accounting.modal.decide: DisputeQueuePage's DecideModal is a real accessible dialog with MoneyInput: pattern miss in apps/frontend/src/pages/accounting/DisputeQueuePage.tsx; --selftest failed
- verify-audit-cashflow-entitylink-unresolved-tombstone.mjs — verify-audit-cashflow-entitylink-unresolved-tombstone FAIL: apps/frontend/src/pages/Users.tsx: must not pass entityLabel(...) into EntityLink label=
- verify-bills-settlement-column-linkage.mjs — AssertionError [ERR_ASSERTION]: shared BILL_HAS_ACTIVE_SETTLEMENT_EXISTS_SQL must be extractable; --selftest failed
- verify-bills-void-filter-uses-revoked-at.mjs — ✗ apps/backend/src/reports/vendor-report.service.ts: filters b2.voided_at without also testing revoked_at. voidBill() writes revoked_at and never voided_at, so this predicate matches EVERY properly-vo
- verify-cash-advance-requests-parity-surface-bar.mjs — --selftest failed: if (!cond) throw new Error(msg);
- verify-cash-advances-f9930-no-silent-catch.mjs — --selftest failed: FAIL(selftest): offender A mutation did not change the file — pattern out of sync
- verify-cash-advances-home-staged-filters.mjs — - must expose filter-reset
- verify-cash-advances-table-parity-surface-bar.mjs — if (!cond) throw new Error(msg);; --selftest failed
- verify-cash-flow-closed-settlement-expected-expense.mjs — [verify-cash-flow-closed-settlement-expected-expense] FAILED
- verify-cash-flow-driver-pay-populated.mjs — [verify-cash-flow-driver-pay-populated] FAILED
- verify-cash-flow-independent-of-proforma-timing.mjs — - unbilled forecast must read canonical booked charge lines without requiring an invoice; --selftest failed
- verify-cash-flow-rolling-ledger-4-fixes.mjs — - apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx: tabHasInvoiceDateColumn contract not satisfied
- verify-cash-flow-void-exclusion.mjs — [verify-cash-flow-void-exclusion] FAILED
- verify-company-settlements-list-route.mjs — - report engine reads dispatch.load_charge_lines 3x but filters is_active only 2x — a replaced rate is billed twice; --selftest failed
- verify-connectivity-nonmoney-create-remainder.mjs — --selftest failed: verify-fleet-unit-roster-modals SELFTEST FAIL — kind-filter-apply: mutation escaped
- verify-creator-advance-is-bill-payment-on-its-load.mjs — apps/backend/src/cash-advances/cash-advance-create.ts: a historical bill-payment advance must credit the driver net-pay clearing role account (a liability; never 1090, never a bank, never A/P); --selftest failed
- verify-deadhead-pay-line-renders-on-settlement.mjs — - SettlementDetailPage.tsx does not filter settlement_lines for line_type==='deadhead_pay'; --selftest failed
- verify-escrow-ledger-row-has-load.mjs — FINDING: ACCT-ENG-03 DATABASE_URL required
- verify-escrow-pending-parity-surface-bar.mjs — --selftest failed: if (!cond) throw new Error(msg);
- verify-expense-category-map-tenant-scope.mjs — verify:expense-category-map-tenant-scope — FAILED
- verify-item-income-account-required.mjs — --selftest failed: verify-item-income-account-required SELFTEST FAILED:
- verify-list-empty-settled.mjs — --selftest failed: [verify-list-empty-settled] FAIL: selftest did not reject the planted Work Orders false-empty race
- verify-load-costs-settlement-legs-columns.mjs — - SettlementsToursRegister Started/Closed dates must use the compact mmmDd formatter; --selftest failed
- verify-load-miles-match-settlement-document.mjs — verify-load-miles-match-settlement-document: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-
- verify-money-kpi-strip-no-fake-zero-on-error.mjs — FAIL verify-money-kpi-strip-no-fake-zero-on-error: apps/frontend/src/pages/accounting/InvoicesListPage.tsx: "Total billed:" strip not found — did it move?; --selftest failed
- verify-moneyinput-single-frame-vertical.mjs — verify-moneyinput-single-frame-vertical FAIL: MoneyInput's own <input> frame must stay intact — this guard governs the outer wrapper, not the control; --selftest failed
- verify-no-circular-dependencies.mjs — ✗ import cycle (17 files) contains non-allowlisted file(s): driver-finance/settlement-creator-deliver.ts, dispatch/stamp-final-delivery-departure.ts, driver-finance/driver-pay-delivery-accrual.service
- verify-no-money-gate-depends-on-wall-clock-time.mjs — ✗ scripts/verify-94-live-counter-linkage.mjs
- verify-scenario-ap-insurance-honest.mjs — - insurance tab claims nav missing in apps/frontend/src/pages/safety/tabs/InsuranceTab.tsx
- verify-scenario-tracker-live-binding.mjs — - apps/backend/src/home/scenario-registry.ts: "scenario.trailer_swap" does not prove its complete chain (missing `l.status::text NOT IN ('delivered', 'cancelled', 'void', 'completed', 'closed')`).; --selftest failed
- verify-settled-load-stops-carry-the-document.mjs — verify-settled-load-stops-carry-the-document: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9
- verify-settlement-close-fallback-opens-if-missing.mjs — ✗ apps/backend/src/driver-finance/settlements-load-bookended.service.ts: no fallback found — when the primary open-settlement lookup returns empty, this must call openLoadBookendedSettlement (the same; --selftest failed
- verify-settlement-void-cascade.mjs — [verify-settlement-void-cascade] FAILED — 1 issue(s):; --selftest failed
- verify-surface-bar-modal-inventory.mjs — - pages/samsara-vendor-mapping/VendorMappingResolutionPage.tsx: Modal host has no required.json leaf.surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED — add a leaf or map it
- verify-surface-bar-paritydrawer-inventory.mjs — - pages/inventory/PartEditDrawer.tsx: ParityDrawer host has no required.json leaf.surface_path / FILE_OWNED_BY_LEAF / ALLOWED_NESTED — add a leaf or map it
- verify-truck-one-in-motion-plus-advance.mjs — verify-truck-one-in-motion-plus-advance: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B ow

## CC-2 — banking-fuel-factoring (14)
- verify-bank-automatch-memo-threshold-calibrated.mjs — --selftest failed: verify-bank-automatch-memo-threshold-calibrated SELFTEST FAILED: dropping the memo gate entirely not caught
- verify-bank-econ-04-honesty-keep.mjs — --selftest failed: Error: ENOENT: no such file or directory, open '/tmp/verify-bank-econ-04-honesty-keep-lflYk2/apps/frontend/src/pages/banking/BankReconciliationPage.tsx'
- verify-banking-palette-section7.mjs — apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx: #15803D; --selftest failed
- verify-banking-rules-follow-owner-rulings.mjs — verify-banking-rules-follow-owner-rulings: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B
- verify-factoring-batch-wizard-qbo-chrome.mjs — - factoring.modal.deactivate_factor_confirm: real Modal: pattern miss in apps/frontend/src/components/factoring/DeactivateFactorConfirmModal.tsx; --selftest failed
- verify-factoring-collapsed-filter-chrome.mjs — - apps/frontend/src/pages/factoring/FactoringHome.tsx: missing CollapsedListFilters import.
- verify-factoring-equipment-vendor-merges-collapsed-filters.mjs — - apps/frontend/src/pages/factoring/FactoringHome.tsx: vendor_merges tab's ParityTable must receive a <CollapsedListFilters> as filterBar.
- verify-factoring-nav-reachable.mjs — - apps/frontend/src/pages/factoring/FactoringHome.tsx — could not find a <NavyPageSubNav items={[...]}/> block (extraction pattern is stale)
- verify-factoring-package-popup-block-honesty.mjs — --selftest failed: verify-factoring-package-popup-block-honesty SELFTEST FAIL — revert pattern did not match source, re-anchor
- verify-factoring-surface.mjs — - could not isolate the Account Summary render block (markers moved?) — re-anchor this guard; --selftest failed
- verify-faro-kpi-strip.mjs — --selftest failed: verify-faro-kpi-strip --selftest: mutation "a duplicate value" did not change the source — fixture drifted
- verify-faro-tabs-real-data.mjs — - apps/frontend/src/pages/factoring/FactoringHome.tsx: the tab strip must be built from FARO_TABS (router/route-manifest.ts), the owner's ten.
- verify-fuel-posts-only-on-bank-match.mjs — --selftest failed: verify-fuel-posts-only-on-bank-match --selftest FAIL: not caught: dreamline discount posts twice
- verify-relay-tick-completes.mjs — --selftest failed: ETIMEDOUT spawnSync /opt/homebrew/Cellar/node/26.3.0/bin/node ETIMEDOUT

## CURSOR — ui-lists-customers-vendors (20)
- verify-collapsed-list-filters-apply.mjs — - vendors: COVERED evidence is not a class consumer
- verify-create-surface-is-drawer.mjs — - DRAWER-LAW: apps/frontend/src/pages/safety/PermitsPage.tsx:305 opens a CENTERED modal for a create surface [verb] — title: Create permit. Pass `variant="drawer"`.
- verify-customer-reclassification-history-scope.mjs — --selftest failed: verify-customer-reclassification-history-scope SELFTEST FAIL: inert mutations: drop company context
- verify-customers-list-master-detail.mjs — - apps/frontend/src/pages/Customers.tsx: secondary detail tab controls must drive the canonical URL-backed active tab; --selftest failed
- verify-customers-open-balance-excludes-void.mjs — --selftest failed: verify-customers-open-balance-excludes-void SELFTEST FAILED:
- verify-customers-vendors-list-segment-tabs.mjs — - Customers.tsx missing NavyPageSubNav; --selftest failed
- verify-datepicker-label-clickthrough-reopen.mjs — --selftest failed: FAIL(selftest): pre-fix-offender mutation did not change the source — regex out of sync with the real block
- verify-every-selector-multi-select.mjs — verify-every-selector-multi-select: FAIL — raw <select> count grew: 11 > baseline 10
- verify-insurance-dashboard-excludes-fixture-data.mjs — --selftest failed: verify-insurance-dashboard-excludes-fixture-data SELFTEST FAIL — mutation escaped: {"key":"coverageGap","from":"\n    AND ${excludeDemoPhantomSql(\"u.unit_number\")}","to":""}
- verify-insurance-pageheader-usage.mjs — ✗ verify-insurance-pageheader-usage: PolicyDetail PageHeader usage regressed.
- verify-inventory-parts-create-qbo-chrome.mjs — - parts.create / parts.create.vendor_picker / parts.create.money: PartCreateDrawer real fixed-overlay drawer + real EntityPicker vendor field + real MoneyInput: pattern miss in apps/frontend/src/pages; --selftest failed
- verify-k9-landing-filter-bar.mjs — ✗ FAIL
- verify-list-defaults-and-kpi-shape.mjs — --selftest failed: FAIL: Customers: missing data-c31-list-default marker
- verify-list-rows-use-datatable.mjs — - PreSettlementsPanel missing governed Status column; --selftest failed
- verify-lists-catalog-search-debounced.mjs — --selftest failed: verify-lists-catalog-search-debounced FAIL — selftest: depth plant must change file
- verify-module-hub-navigation-connectivity.mjs — module hub navigation connectivity guard failed:
- verify-orphan-components.mjs — Do NOT add it to the baseline — the baseline is a shrinking burn-down list, never grow it.
- verify-proportion-chrome-modal-drawer-density.mjs — - proportion-chrome.css missing: --ih35-field-height: 32px; --selftest failed
- verify-reports-qbo-chrome-leaves.mjs — - ReportsHome missing the honest KPI no-fabrication guarantee; --selftest failed
- verify-table-header-and-date-column.mjs — - hand-rolled <table> count rose 40 -> 55 (list only this PR; do not convert here)
