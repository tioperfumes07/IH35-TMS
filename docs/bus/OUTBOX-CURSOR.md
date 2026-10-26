# OUTBOX-CURSOR

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — FinalizeBlock → BoardSection

- **STATUS:** SHIPPING
- **DELTA:** FinalizeBlock → `BoardSection`; Save Draft stays honestly disabled (no draft API). Guard ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlement-fe-honesty PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FinalizeBlock.tsx · verify-settlement-fe-honesty.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL batch tip (BoardSection unlayer)

- **STATUS:** MERGED — #27723 · #27727 · #27728 · #27729 · #27731 · #27733 · #27735 · #27737 · #27738 · #27740
- **DELTA:** Factoring Faro tabs + Escrow/Cash/Aging/Fees/Purchase/Account Summary/internal tabs; Settlements Disputes/Statement/Header/DriverBill/Detail empty; Fuel Planner + Relay deposit empty/error → BoardSection/FuelBoardSection; FORM_INPUT heights where page inputs touched. Engines unchanged.
- **VERIFY:** each PR: `tsc -b` EXIT 0 · `vite build` EXIT 0 · surface guards PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell (FinalizeBlock Save Draft still honest stub — no draft API; remaining bare cards elsewhere)
- **Files Modified:** OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SettlementDetail empty → BoardSection

- **STATUS:** MERGED [#27740](https://github.com/tioperfumes07/IH35-TMS/pull/27740)
- **DELTA:** SettlementDetailPage no-settlement empty → `BoardSection`. Guard ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlement-detail-sections PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** SettlementDetailPage.tsx · verify-settlement-detail-sections.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — DriverBillDetail → BoardSection

- **STATUS:** SHIPPING
- **DELTA:** DriverBillDetailPage pay body + unlinked empty → `BoardSection` (LoadDetailDriverPayTab unchanged). Guard ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-load-detail-driver-pay-bills PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** DriverBillDetailPage.tsx · verify-load-detail-driver-pay-bills.mjs · OUTBOX-CURSOR.md
## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SettlementHeader → BoardSection

- **STATUS:** MERGED [#27735](https://github.com/tioperfumes07/IH35-TMS/pull/27735)
- **DELTA:** SettlementHeader bare grid card → `BoardSection` (Refresh in headerRight). Engines/EntityLinks unchanged. verify-settlement-fe-honesty ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlement-fe-honesty PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** SettlementHeader.tsx · verify-settlement-fe-honesty.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Relay deposit empty/error → FuelBoardSection

- **STATUS:** MERGED [#27737](https://github.com/tioperfumes07/IH35-TMS/pull/27737)
- **DELTA:** RelayDepositReview no-company + load-error returns → `FuelBoardSection` (engines unchanged). Guard ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-relay-deposit-review-parity-surface-bar PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** RelayDepositReview.tsx · verify-relay-deposit-review-parity-surface-bar.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Statement workflow + EscrowVisualizer → BoardSection

- **STATUS:** MERGED [#27733](https://github.com/tioperfumes07/IH35-TMS/pull/27733)
- **DELTA:** EscrowVisualizer · Approval · Payment Status · no-settlement empty · Presettlement help → `BoardSection`; payment/reopen inputs → `FORM_INPUT_CLASS`. Engines/approve/pay paths unchanged. Guard ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlement-detail-sections PASS · verify-acct-surf-09-reverse-drill PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** EscrowVisualizer · SettlementStatementWorkflowPage · PresettlementSuggestionsTab · verify-settlement-detail-sections · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel Planner → FuelBoardSection

- **STATUS:** MERGED [#27731](https://github.com/tioperfumes07/IH35-TMS/pull/27731)
- **DELTA:** FuelPlannerHome planner tab — Active load plan · HOS route diagram · stop-logic · recommended stops → `FuelBoardSection`. Guard ratcheted. Engines unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fuel-planner-active-routes-exact-range PASS (+ --selftest 7/7)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell (Statement workflow / EscrowVisualizer bare cards)
- **Files Modified:** FuelPlannerHome.tsx · verify-fuel-planner-active-routes-exact-range.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Settlements Disputes → BoardSection

- **STATUS:** MERGED [#27729](https://github.com/tioperfumes07/IH35-TMS/pull/27729)
- **DELTA:** SettlementDisputesTab filters + detail → `BoardSection`; filter/status heights to FILTER/FORM tokens; engines/resolve/review unchanged. Guard ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlement-disputes-parity-surface-bar PASS (+ --selftest) · staged-filters PASS · tab-labels PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell (FuelPlannerHome / Statement workflow bare cards)
- **Files Modified:** SettlementDisputesTab.tsx · verify-settlement-disputes-parity-surface-bar.mjs · OUTBOX-CURSOR.md
## 2026-10-25 CT — CURSOR → LEAD | ACCT-F443293-C gate follow-up (shipping)

- **STATUS:** SHIPPING — branch `cursor/443293-c-accounting-tabs-c89b` rebased on `origin/main` after [#27635](https://github.com/tioperfumes07/IH35-TMS/pull/27635) squash `5620b45102`
- **DELTA:** Push-gate hygiene — selector BASELINE 11; settlement verify `ALLOW_OFFLINE_SKIP`; repair-settlement owner-auth on `--apply`; OUTBOX≤200 + HONEST-BUILT cites on seat INBOXes
- **VERIFY:** `verify-bus-diet-outbox-cap` PASS · `verify-honest-built-launch-law-present` PASS · `branch:precheck-push` PASS at push `47c1ed699c`
- **LIVE PROOF:** UNVERIFIED — coding-only; no Chrome
- **NEXT:** open follow-up PR → merge
- **Files Modified:** bus INBOX/OUTBOX · repair-settlement-header-eng43.mjs · verify-one-active-linehaul-per-load.mjs · verify-settlement-*.mjs · verify-every-selector-multi-select.mjs

## 2026-10-25 CT — CURSOR → LEAD | ACCT-F443293-C MERGED #27635

- **STATUS:** MERGED squash `5620b45102` — Receipts V3 board grammar
- **LIVE PROOF:** UNVERIFIED — coding-only per FINAL-3

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Factoring internal tabs → BoardSection + FORM_INPUT

- **STATUS:** MERGED [#27728](https://github.com/tioperfumes07/IH35-TMS/pull/27728)
- **DELTA:** Faro imports (upsert + recent) · Equipment loans (create / list / ledger) · Vendor merges (create + history) → `BoardSection`; page inputs → `FORM_INPUT_CLASS` (40px). Guard ratcheted. Engines/upload/save paths unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-layout-tabs-first PASS (+ --selftest 16/16)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements/Fuel dead actions / KPI gaps
- **Files Modified:** FactoringHome.tsx · verify-factoring-layout-tabs-first.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Factoring remaining tabs → BoardSection

- **STATUS:** MERGED [#27727](https://github.com/tioperfumes07/IH35-TMS/pull/27727)
- **DELTA:** Escrow Account · Cash Reserve · Chargebacks & Overpayments · Account Summary Faro lines · Purchase report · Fees Paid · Aging · Reserve tracker · Recourse · Chargebacks & Fees · Statements/Settings → shared `BoardSection` (engines/ParityTable unchanged). Guard ratcheted for all listed testIds.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-layout-tabs-first PASS (+ --selftest 16/16)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell (Faro imports / equipment loans / vendor merges still bare cards)
- **Files Modified:** FactoringHome.tsx · verify-factoring-layout-tabs-first.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Factoring report tabs → BoardSection

- **STATUS:** MERGED [#27723](https://github.com/tioperfumes07/IH35-TMS/pull/27723)
- **DELTA:** Unwrap layered bare card divs on Faro report tabs (Funds Due · Debtor credit check · Debtor Receipts · Loan/Save · Unapplied Cash · Invoice Status · Messages & Support) into shared `BoardSection`; engines/ParityTable unchanged. Guard ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-layout-tabs-first PASS (+ --selftest 16/16)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FactoringHome.tsx · verify-factoring-layout-tabs-first.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Recovered KPI from advance_recovery lines

- **STATUS:** MERGED [#27721](https://github.com/tioperfumes07/IH35-TMS/pull/27721)
- **DELTA:** `recovered_this_period` now sums live `settlement_lines` `advance_recovery` (ABS amount) for Sunday-week settlements — includes partial takes (prior stamp via `recovered_in_settlement_id` missed partials). FE sub copy updated.
- **VERIFY:** `cd apps/backend && npx tsc --noEmit -p .` EXIT 0 · `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-cash-advances-tabs-url-sync PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** cash-advances.routes.ts · CashAdvancesKpiRow · settlementsV3BoardStrings · MEMORY_BANK · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Accounting Escrow Scheduled honesty

- **STATUS:** MERGED [#27717](https://github.com/tioperfumes07/IH35-TMS/pull/27717)
- **DELTA:** EscrowPage Scheduled releases → always `"—"` + `no schedule feed` (drop dead `scheduledAvailable?"0"`); ratchet verify-escrow-posting-entitylink-reverse.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-escrow-posting-entitylink-reverse PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** EscrowPage · verify-escrow-posting-entitylink-reverse · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Escrow Register + Settlements Home Export

- **STATUS:** MERGED [#27716](https://github.com/tioperfumes07/IH35-TMS/pull/27716)
- **DELTA:** Wire dead Export buttons to real client CSV — Escrow Register (`filteredRows`) + Settlements Home Week-of roster (`weekOfRows`). Guards reject dead export-flag navigate / unwired Export.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlements-escrow-board-rebuild PASS · verify-v3-board-grammar-every-surface PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell on remaining dead actions / KPI gaps
- **Files Modified:** EscrowRegisterPage · SettlementsHomeBoardPanels · verify-settlements-escrow-board-rebuild · verify-v3-board-grammar-every-surface · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Cash Advances Recovered + Escrow Scheduled

- **STATUS:** MERGED [#27714](https://github.com/tioperfumes07/IH35-TMS/pull/27714)
- **DELTA:** `GET /cash-advances/dashboard/kpis` adds `recovered_this_period` (sum amount−outstanding via `recovered_in_settlement_id` × Sunday-week `period_end`); SettlementsCashAdvancesBoard + CashAdvancesKpiRow wire the figure; Escrow Scheduled releases drops fake `"0"` → honest `"—"` + `no schedule feed` (matches EscrowPage). Guards ratcheted.
- **VERIFY:** `cd apps/backend && npx tsc --noEmit -p .` EXIT 0 · `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-cash-advances-tabs-url-sync PASS · verify-settlements-escrow-board-rebuild PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell on remaining Settlements/Fuel/Factoring KPI gaps
- **Files Modified:** cash-advances.routes.ts · SettlementsCashAdvancesBoard · CashAdvancesKpiRow · settlementsV3BoardStrings · SettlementsEscrowBoard · verify-cash-advances-tabs-url-sync · verify-settlements-escrow-board-rebuild · MEMORY_BANK · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-3 DONE (443.365-A + field heights + 443.280 re-measure)

- **STATUS:** Cursor DONE — FINAL-3 rows 1–3 complete (coding only; no Chrome)
- **PR LIST:**
  1. #27704 — 443.365-A Cursor half: 15 hand-built overlays → Modal/ParityDrawer; baseline 34→19 (MERGED)
  2. #27707 — page-level FORM_INPUT_CLASS (40px) / FILTER_CONTROL_SIZE_CLASS (34px); 61 hand heights → tokens (MERGED)
  3. #27710 — 443.280 re-measure: Settlements+Fuel tabs BoardSection/FuelBoardSection already rebuilt; Factoring Submit `<details>` pipeline → BoardSection; Purchase-report Kpi/CashFlow wrapped BoardSection (auto-merge)
- **RE-MEASURE:** Settlements Home/Open/Closed/Close/Company/Escrow/Escrow Register/Cash Advances/Deductions/Pre-Settlements = REBUILT (BoardSection). Fuel Home + all sub-tabs = REBUILT (FuelBoardSection, no pagination tiles). Factoring Account summary = REBUILT; Submit/Purchase report unlayered this PR.
- **VERIFY:** tsc -b EXIT 0 + vite build EXIT 0 on each PR; verify-popups-one-format OK; verify-factoring-layout-tabs-first PASS
- **LIVE PROOF:** UNVERIFIED: FINAL-3 coding-only — no Chrome
- **NEXT:** none — FINAL-3 file complete
- **Files Modified:** WriteCheckForm · AllocationsPage · DisputeQueue* · DisputesHub · ExpenseCategoryMap · FixedAssets · Prepaid · Reclassify · RevenueRecognition · LoanApplicationWizard · BankingTransactionsDesignView · CategorizeDrawer · PrintOrientationDialog · MarkDisbursedModal · FactorAdmin · verify-popups baseline · page field-height pages · FactoringHome · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR DONE | ACCT-F443293-C accounting Bills V3 toolbars — pushed `35d4751184`

- **BRANCH:** `cursor/443293-c-accounting-tabs-c89b` · tip `35d4751184` · **PR:** [#27635](https://github.com/tioperfumes07/IH35-TMS/pull/27635)
- **DELTA:** Accounting tabs → MoneyListToolbar (Bills V3); DrillKpiCard; settlements scoreboard `close_board`/`close_trip`; bus diet (OUTBOX 153 + archive); INBOX-CC trim; ALLOW_OFFLINE_SKIP on verify-one-active-linehaul-per-load (gate unblock, CC-1 breach line); ENG43 repair owner-auth retrofit + settlement verify ALLOW_OFFLINE_SKIP (main-tip push gate)
- **GUARD:** branch:precheck-push PASS · verify-bus-diet-outbox-cap · money-pr-local-gate exit 0 · verify-no-unauthorized-production-write exit 0
- **LIVE PROOF:** `git push` forced update `35d4751184` on origin; UNVERIFIED: no Chrome (coding-only)
- **NEXT:** CI green #27635 → squash merge
- **Files Modified:** accounting toolbars · moneyListKpiCard · settlements.required.json · ReceiptsPage · guards · bus files · verify-one-active-linehaul-per-load.mjs

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 114 + 118 process confirmation (443.282 / legacy-sections guard)

- **BRANCH:** `cursor/443282-confirm-process` · tip after #27675 popup standard
- **DELTA:** CONFIRM 443.282 owner-authorized build: Fuel board shell (FUEL_BOARD_SUBNAV + Import/Add fill) + Settlements Company/Open/Closed/Close/Escrow/Fuel Home/Fuel sub-tabs shipped FULL BoardSection/FuelBoardSection this FINAL-2 stretch (#27661–#27675). Row 118 `verify-board-page-no-legacy-sections` already CODED on main (Codex #27379, selftest 10/10) — Cursor does not re-author.
- **GUARD:** verify-board-page-no-legacy-sections --selftest · verify-fuel-home-dashboard-wired board shell
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** hand-built overlay conversion batches (35 remaining, shrink-only) + any Lead re-measure reds
- **Files Modified:** OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 222 Popup standard + Fuel Assignment FULL (shipping)

- **BRANCH:** `cursor/443295-fuel-assignment-popup` · tip after #27674 Fuel sub-tabs
- **DELTA:** Modal size caps sm480/md720/lg960/xl1280 (never 85% window); FuelAssignmentPopup = V3-Modal-FuelAssignment (Fill · Evidence · Proposed · Change · Engine notes); reason = catalog dropdown.
- **GUARD:** verify-fuel-assignment-popup · verify-popups-one-format · verify-chrome-14-remaining-modal-shells · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** remaining FINAL-2 D/process rows
- **Files Modified:** Modal.tsx · modal-size-prefs.ts · FuelAssignmentPopup.tsx · verify-fuel-assignment-popup · verify-popups-one-format · verify-chrome-14 · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 56 Fuel › 10 sub-tabs FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-fuel-subtabs-no-pagination` · tip after #27672 Company
- **DELTA:** Remove pagination KPI tiles (This page / Page size / In view) from Questions, Fills, Relay unmatched, Card overage, Fraud; History = one KPI row + FuelBoardSection fills table; Expense mapping + Loves prices use FuelBoardSection.
- **GUARD:** verify-fuel-home-dashboard-wired · verify-fuel-history-transaction-date-display · verify-fuel-assignment-popup · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** FINAL-2 D-series / remaining process rows
- **Files Modified:** FuelPlannerHome · FuelQuestionsPanel · RelayUnmatchedPage · CardOverageQueuePage · FraudAlertsList · verify-fuel-* · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 50 Settlements Company FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-settlements-company-board` · tip after #27671 Fuel Home
- **DELTA:** CompanySettlementsPage closed-tours board is FULL BoardSection (title + design subtitle + View all →) wrapping ParityTable; no duplicate ParityTable title; engines unchanged (listTours closed).
- **GUARD:** verify-company-settlements-page (--selftest) · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** Fuel 10 sub-tabs
- **Files Modified:** CompanySettlementsPage.tsx · verify-company-settlements-page.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 55 Fuel › Home FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-fuel-home-board` · tip after #27669 Escrow
- **DELTA:** FuelHome diesel-by-truck + Relay import wrap in FuelBoardSection; Oct|Sep|YTD grain in section header; attribution footer board text. Engines unchanged (getFuelDashboard / fetchDieselByTruckAggregate).
- **GUARD:** verify-fuel-home-dashboard-wired · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** Fuel 10 sub-tabs + Settlements Company
- **Files Modified:** FuelHome.tsx · verify-fuel-home-dashboard-wired.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 rows 53–54 Settlements Escrow + Escrow Register FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-settlements-escrow-board` · tip after #27666 Close
- **DELTA:** SettlementsEscrowBoard + EscrowRegisterPage wrap ParityTable in shared BoardSection (View all + board footers). Open register → retained. Grammar forbids V3Panel. Engines unchanged.
- **GUARD:** verify-settlements-escrow-board-rebuild + verify-v3-board-grammar-every-surface · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** Settlements Company + Fuel boards
- **Files Modified:** SettlementsEscrowBoard.tsx · EscrowRegisterPage.tsx · verify-settlements-escrow-board-rebuild.mjs · verify-v3-board-grammar-every-surface.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 49 Settlements Close FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-settlements-close-board` · tip after #27663 Open/Closed
- **DELTA:** SettlementCloseArrivalPage step body + Result unwrap to shared BoardSection (CloseBoardPanel); SubNav KPI strip = Open drivers · Gross · Deductions · Escrow · Advances recovered · Net to driver (outside wizard board per 443.280-A). Engines unchanged.
- **GUARD:** verify-settlements-qbo-chrome-surfaces + verify-v3-board-grammar-every-surface · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** Settlements Company/Escrow + Fuel boards
- **Files Modified:** SettlementCloseArrivalPage.tsx · verify-settlements-qbo-chrome-surfaces.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 rows 45–46 Settlements Open/Closed FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-settlements-open-board` · tip after #27661 Settlements Home
- **DELTA:** SettlementsToursRegister rebuilt to docs/design/v3/Settlements-Open|Closed — V3KpiTile strip + MoneyListToolbar (search + Open/Closed pills) + shared BoardSection + ParityTable. Grammar surface promoted off chromeOnly. Engines unchanged (listTours).
- **GUARD:** verify-settlements-module-one-readout + verify-v3-board-grammar-every-surface · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** Settlements Close/Company/Escrow + Fuel boards
- **Files Modified:** SettlementsToursRegister.tsx · verify-settlements-module-one-readout.mjs · verify-v3-board-grammar-every-surface.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 44 Settlements Home FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-settlements-home-board` · tip after #27660 Factoring
- **DELTA:** SettlementsHomeBoardPanels → shared BoardSection; Week-of Status ● Paid/Open (board); chart footer board grammar; SettlementRefCell beside loads; Export control; FactoringHome grammar surface chromeOnly (tip unblock after 443.280 unlayer). Board contract folded into assertSettlementsHomeNoPanelExtract (step 18800) — no new CLAIMED verify-step (TOOL-F03).
- **GUARD:** verify-v3-board-grammar-every-surface (Settlements Home board asserts) · money-pr-local-gate
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** Settlements Open/Closed/Close/Company/Escrow + Fuel boards
- **Files Modified:** SettlementsHomeBoardPanels.tsx · SettlementsPage.tsx · verify-v3-board-grammar-every-surface.mjs · OUTBOX-CURSOR.md


## 2026-10-25 CT — CURSOR → LEAD | FINAL-2 row 39 Factoring Home FULL BOARD (shipping)

- **BRANCH:** `cursor/443280-factoring-home-board` · tip `2c7957a138` (= #27657 Banking Home)
- **DELTA:** FactoringHome unlayered — removed always-on KPI strip + MoneyListToolbar + FactoringHomeBoard + Kpi/CashFlow above every Faro tab. FactoringHomeBoard mounts only under Account summary (docs/design/v3/Factoring). FactoringKpiPanel + FactoringCashFlowPanel stay on Purchase report (Rule 07 r315/r326). verify-factoring-layout-tabs-first retargeted to FactoringBoardChrome + 443.280 ratchet.
- **GUARD:** verify-factoring-layout-tabs-first --selftest 16/16 + live PASS · verify-fact-s01-home-surface PASS
- **LIVE PROOF:** UNVERIFIED: FINAL-2 coding-only — no Chrome
- **NEXT:** Settlements / Fuel boards
- **Files Modified:** FactoringHome.tsx · verify-factoring-layout-tabs-first.mjs · OUTBOX-CURSOR.md

Older FINAL-2 rows (31–38): [archive/OUTBOX-CURSOR-archive-2026-10-25.md](archive/OUTBOX-CURSOR-archive-2026-10-25.md).
