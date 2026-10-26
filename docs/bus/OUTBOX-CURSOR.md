# OUTBOX-CURSOR

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Settlements detail + Accounting remaining boards (horizontal)

- **STATUS:** SHIPPING
- **DELTA:** Settlement detail sections (Earnings · Deadhead · Extra pay · Reimbursements · Deductions · Fuel · Loads) → BoardSection (Add buttons kept as headerRight). Accounting Month close · Sales tax · Opening balances · Create multiple bills · Daily recon · Account register → BoardSection. Engines unchanged. Guard verify-fill-remaining-boards-batch via 1747; settlement-detail-reference accepts BoardSection testId.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fill-remaining-boards-batch PASS · verify-settlement-detail-sections PASS · verify-settlement-detail-reference PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Remaining PARTIAL depth (Unexpected already BoardSection; popup 222; Collections/VendorBalances); Chrome close when authorized
- **Files Modified:** driver-finance/*Section.tsx · MonthClosePage · SalesTaxPage · OpeningBalanceRegisterPage · CreateMultipleBillsPage · DailyReconPage · AccountRegisterPage · verify-fill-remaining-boards-batch.mjs · verify-settlement-detail-reference.mjs · 1747 · OUTBOX

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Banking Home BoardSection panels (real code)

- **STATUS:** MERGED [#27858](https://github.com/tioperfumes07/IH35-TMS/pull/27858) @ `2da5eaff04`
- **DELTA:** BankingHome Accounts bank-list · Factoring virtual · Inspect · Relay · Statement Import · Plaid · Settings panels → shared `BoardSection`. Honesty banners unchanged. Statement account select → FORM_SELECT_CLASS. Engines (reorder/inspect/StatementUpload/Plaid) kept. New verify-banking-home-boards via step 12561. Prior ACCT-F220 tools #27843 MERGED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-banking-home-boards PASS · verify-banking-bare-plus-accessible-label PASS · verify-banking-home-preview-parity PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed/Escrow Register PARTIAL depth; popup 222; Accounting 220 remaining audit
- **Files Modified:** BankingHome.tsx · verify-banking-home-boards.mjs · 12561-verify-banking-home-preview-parity.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Accounting tools BoardSection + Factoring FORM_INPUT (real code)

- **STATUS:** MERGED [#27843](https://github.com/tioperfumes07/IH35-TMS/pull/27843) @ `385e220d78`
- **DELTA:** Reclassify (account tree · filters · grid · batches) · Batch Expenses (type · toolbar · grid) · Accounting Escrow (accounts · postings) → shared `BoardSection`. Factoring Home profile edit inputs → `FORM_INPUT_CLASS`. Engines (applyReclassify / createExpense / escrow list) unchanged. New verify-acct-220-tools-boards (wired via step 1747). Pending 220 PARTIAL; Factoring Home stays CODED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-acct-220-tools-boards PASS · verify-b5-reclassify-batch PASS · verify-v3-board-grammar-every-surface PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed/Escrow Register PARTIAL depth; Banking Home bare panels; popup 222 remaining
- **Files Modified:** ReclassifyTransactionsPage · BatchExpensesPage · EscrowPage · FactoringHome · verify-acct-220-tools-boards.mjs · 1747-verify-acct-surf-02-expenses.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Settlement Creator BoardSection (real code)

- **STATUS:** MERGED [#27838](https://github.com/tioperfumes07/IH35-TMS/pull/27838) @ `ffc1ad4478`
- **DELTA:** SettlementCreatorDrawer `Section()` + Post result + Settlement totals + JE Preview → shared `BoardSection`. Money engines / Preview / Post / subtotals / PDF tie-out unchanged. New verify-settlement-creator-board-sections (wired via step 3424). Pending Open/Closed stay PARTIAL (tabs already BoardSection+engines; creator was the bare-card gap).
- **VERIFY:** tsc -b EXIT 0 · verify-settlement-creator-board-sections PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed remaining depth if any; Factoring profile FORM_INPUT; Accounting Reclassify/Batch
- **Files Modified:** SettlementCreatorDrawer.tsx · verify-settlement-creator-board-sections.mjs · 3424-verify-settlements-qbo-chrome-surfaces.mjs · OUTBOX-CURSOR.md


## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Accounting 220 money-list BoardSection (real code)

- **STATUS:** MERGED [#27835](https://github.com/tioperfumes07/IH35-TMS/pull/27835) @ `4e9322a488`
- **DELTA:** Real `BoardSection` register wraps on 12 Accounting money-list tabs (Expenses · Receipts · Checks · Invoices · Payments · Bill payments · Vendor credits · Credit memos · Manual JE · Factoring advances · Prepaid · Fixed assets). kpiStrip + moneyListKpiCard + void/create engines unchanged. Prior Expenses tip was guard-only — this ships the page code. New guard verify-acct-220-money-list-boards; receipts/checks/expenses guards ratcheted. Pending 220 PARTIAL.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-acct-surf-02-expenses PASS · verify-acct-receipts-leaf PASS · verify-checks-list-shows-every-check PASS · verify-acct-220-money-list-boards PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Settlements Open/Closed PARTIAL depth; remaining Accounting tabs (Escrow/Unexpected already BoardSection; Reclassify/Batch/Hub)
- **Files Modified:** ExpensesListPage · ReceiptsPage · CheckListPage · InvoicesListPage · PaymentsListPage · BillPaymentsListPage · VendorCreditsPage · CreditMemosPage · ManualJEListPage · FactoringListPage · PrepaidExpensesPage · FixedAssetsPage · verify-acct-220-money-list-boards.mjs · verify-acct-surf-02 · verify-acct-receipts-leaf · verify-checks-list · OUTBOX-CURSOR.md


## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Expenses list BoardSection (443.293-C) — SUPERSEDED

- **STATUS:** SUPERSEDED — tip claimed BoardSection but page code was absent (guard-only); replaced by FILL-ACCT-220-MONEY-LIST-BOARDS

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — FuelAssignmentPopup ModalSection → BoardSection

- **STATUS:** MERGED [#27802](https://github.com/tioperfumes07/IH35-TMS/pull/27802)
- **DELTA:** Fuel assignment popup sections (Fill / Evidence / Proposed / Change) → shared `BoardSection` (source as subtitle). Confirm/choose/keep engines unchanged. Guard ratcheted. Pending rows 44/49/53 → CODED.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fuel-assignment-popup PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Accounting 220 depth; Settlements Open/Closed PARTIAL
- **Files Modified:** FuelAssignmentPopup.tsx · verify-fuel-assignment-popup.mjs · CURSOR-PENDING-ROWS-FINAL.md · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL batch tip (engines + BoardSection)

- **STATUS:** MERGED — #27765 · #27769 · #27780 · #27787 · #27792 · #27794 · #27796 · #27797 · #27799 · #27800 · #27801 (+ OUTBOX diet #27793)
- **DELTA:** Fuel Home board KPIs period-synced; By-truck period sync; Settlements Payments V3; Fuel FORM_INPUT; Fuel/Factoring/Escrow empties; SubmitToFactor BoardSection+FORM_INPUT+DataPanel unwrap; Close expense BoardSection; Fuel fraud/overage/planner empties; Submit edit banner. Engines/actions kept. Guards ratcheted.
- **VERIFY:** each PR: tsc -b · vite build · surface guards PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** Accounting 220 (Receipts already Bills-grammar); Settlements Open/Closed PARTIAL depth; Fuel assignment popup 443.295
- **Files Modified:** OUTBOX-CURSOR.md · CURSOR-PENDING-ROWS-FINAL.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SubmitToFactor edit banner BoardSection

- **STATUS:** SHIPPING
- **DELTA:** Edit-purchase banner + non-posted block → `BoardSection` (Cancel in headerRight). Engines unchanged. Guard ratcheted.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-factoring-submission-queue-routed
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** SubmitToFactorTab.tsx · verify-factoring-submission-queue-routed.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel fraud/overage/planner need-company BoardSection

- **STATUS:** MERGED [#27800](https://github.com/tioperfumes07/IH35-TMS/pull/27800)
- **DELTA:** Fraud alerts / Card overage / Fuel planner shell need-company → `FuelBoardSection`. Guard ratcheted. Engines unchanged.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fuel-home-dashboard-wired
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FraudAlertsList · CardOverageQueuePage · FuelPlannerHome · verify-fuel-home-dashboard-wired · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — DataPanel unwrap Submit/Repurchase + Close expense BoardSection

- **STATUS:** MERGED [#27799](https://github.com/tioperfumes07/IH35-TMS/pull/27799)
- **DELTA:** SubmitToFactor Purchase/Faro actuals/Override/Totals + RepurchaseDuePanel → `BoardSection` (DataPanel removed). Settlement Close expense load confirmations → `BoardSection`. Decide/create/post engines unchanged. Guards ratcheted.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-factoring-submission-queue-routed · verify-settlements-qbo-chrome-surfaces
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell remaining Factoring/Settlements layers
- **Files Modified:** SubmitToFactorTab · RepurchaseDuePanel · SettlementCloseArrivalPage · guards · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SubmitToFactor BoardSection + FORM_INPUT

- **STATUS:** MERGED [#27797](https://github.com/tioperfumes07/IH35-TMS/pull/27797)
- **DELTA:** SubmitToFactor owner-only + purchase-posted → `BoardSection`; selects/textarea → `FORM_INPUT_CLASS` / `FORM_TEXTAREA_CLASS`. Create/post/send engines unchanged. Guard ratcheted.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-factoring-submission-queue-routed · verify-91056 leftover
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Close + Factoring remaining DataPanel unwrap
- **Files Modified:** SubmitToFactorTab.tsx · verify-factoring-submission-queue-routed.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel/Factoring/Escrow empty → BoardSection

- **STATUS:** MERGED [#27796](https://github.com/tioperfumes07/IH35-TMS/pull/27796)
- **DELTA:** Fuel Cards/Integrity/Unmatched/Wallet need-company → `FuelBoardSection`; Factoring no-factor → `BoardSection`; Escrow Measured note → `BoardSection`. Guards ratcheted. Engines unchanged.
- **VERIFY:** tsc -b EXIT 0 · vite build EXIT 0 · verify-fuel-home-dashboard-wired · verify-settlements-escrow-board-rebuild · verify-factoring-layout-tabs-first
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Close + Factoring Home remaining
- **Files Modified:** FuelCards/Integrity/Unmatched/Wallet · FactoringHome · SettlementsEscrowBoard · guards · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Settlements Payments V3 KPIs + Fuel create/import FORM_INPUT

- **STATUS:** MERGED [#27794](https://github.com/tioperfumes07/IH35-TMS/pull/27794)
- **DELTA:** Settlements Payments Pending Acks / Held Deductions → `V3KpiTile` (removed local `KpiCard`); CreateFuelTransactionModal + ImportFuel kind select → `FORM_INPUT_CLASS` / `FORM_SELECT_CLASS` (40px). Engines/focus filters/import/create unchanged. Guards ratcheted.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-settlement-fe-honesty PASS (+ --selftest) · verify-fuel-office-create-modal PASS · verify-fuel-history-import-wired PASS
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Home/Close/Escrow + Factoring Home remaining
- **Files Modified:** SettlementsPage.tsx · CreateFuelTransactionModal.tsx · ImportFuelTransactionsModal.tsx · verify-settlement-fe-honesty.mjs · verify-fuel-office-create-modal.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel By-truck period-sync KPIs

- **STATUS:** MERGED [#27792](https://github.com/tioperfumes07/IH35-TMS/pull/27792)
- **DELTA:** By-truck tab shares one Oct/Sep/YTD `byTruckPeriod` between `FuelBoardKpiStrip` and `FuelDieselByTruckPanel` (controlled period props). Same diesel aggregate engine. Guard ratcheted on verify-fuel-home-dashboard-wired board shell.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fuel-home-dashboard-wired PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Home/Close/Escrow + Fuel modals FORM_INPUT
- **Files Modified:** FuelPlannerHome.tsx · FuelDieselByTruckPanel.tsx · verify-fuel-home-dashboard-wired.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel Home board KPIs (443.280)

- **STATUS:** SHIPPING
- **DELTA:** Fuel Home replaces planner `FuelKpiRow` with period-synced `FuelBoardKpiStrip` (Diesel spend / Gallons / Avg $/gal / Fills without a load / Open questions) from diesel aggregate + assignment-questions engines; need-company → `FuelBoardSection`; Love's sync fail-loud kept. Guard ratcheted. Import fills / + Add fill stay on module chrome.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fuel-home-dashboard-wired PASS (+ --selftest) · verify-cap-11-fuel-fraud · verify-fuel-expense-identity-honesty
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell Settlements Home/Close/Escrow + Fuel sub-tabs
- **Files Modified:** FuelHome.tsx · FuelBoardKpiStrip.tsx · verify-fuel-home-dashboard-wired.mjs · OUTBOX-CURSOR.md · CURSOR-PENDING-ROWS-FINAL.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — CashFlowPanel unlayer nested card

- **STATUS:** SHIPPING [#27780](https://github.com/tioperfumes07/IH35-TMS/pull/27780)
- **DELTA:** FactoringCashFlowPanel drops nested `rounded-sm border` card (parent Purchase-report BoardSection owns shell). Collapse/totals/engines unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-r315-home-cash-flow PASS (+ --selftest)
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FactoringCashFlowPanel.tsx · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — SubmissionQueue → BoardSection

- **STATUS:** MERGED [#27769](https://github.com/tioperfumes07/IH35-TMS/pull/27769)
- **DELTA:** SubmissionQueue need-company + filters + queue table → `BoardSection`. Submit/reserve engines unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-submission-queue-parity-surface-bar PASS · wave-c-liability
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** SubmissionQueue.tsx · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Home/Wizard/Planner empty states → BoardSection

- **STATUS:** MERGED [#27765](https://github.com/tioperfumes07/IH35-TMS/pull/27765)
- **DELTA:** FactoringHome loading/need-company → `BoardSection`; BatchWizard need-company + body → `BoardSection`; Fuel planner settings loading/unavailable → `FuelBoardSection`. Engines unchanged.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fill-shell-empty-states PASS · layout-tabs-first · fuel-planner-active-routes · wave-c-liability · settings-lifecycle
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** FactoringHome.tsx · BatchWizard.tsx · FuelPlannerHome.tsx · verify-fill-shell-empty-states.mjs · OUTBOX-CURSOR.md

## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — BatchDetail → BoardSection

- **STATUS:** MERGED [#27767](https://github.com/tioperfumes07/IH35-TMS/pull/27767)
- **DELTA:** BatchDetail summary/invoices/reserve + loading/error/unavailable → `BoardSection`. Engines/reserve KPI unchanged. New guard verify-factoring-batch-detail-board.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-batch-detail-board PASS · paritytable · wave-c-liability
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** BatchDetail.tsx · verify-factoring-batch-detail-board.mjs · OUTBOX-CURSOR.md


## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — Fuel reverse sections → FuelBoardSection

- **STATUS:** SHIPPING
- **DELTA:** RelayFills / FuelCards / FuelCardOverage / FuelFraudAlerts / FuelTransactions reverse sections → `FuelBoardSection`. Engines/links unchanged. New guard verify-fuel-reverse-board-sections.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-fuel-reverse-board-sections PASS (+ --selftest 5/5) · reefer-fuel-credit · null-gallons-honesty
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell
- **Files Modified:** RelayFillsReverseSection · FuelCardsReverseSection · FuelCardOverageReverseSection · FuelFraudAlertsReverseSection · FuelTransactionsReverseSection · verify-fuel-reverse-board-sections.mjs · OUTBOX-CURSOR.md


## 2026-10-25 CT — CURSOR → LEAD | FILL-NOT-SHELL — FactoringProfile + FactorAdmin → BoardSection

- **STATUS:** SHIPPING [#27757](https://github.com/tioperfumes07/IH35-TMS/pull/27757) (squash auto-merge armed)
- **DELTA:** FactoringProfilePanel full/compact → `BoardSection` (FAC-07 ≤220px wrap kept); FactorAdmin selected detail + customer history → `BoardSection`; modal inputs → `FORM_INPUT_CLASS`. Engines unchanged. New guard verify-factoring-profile-admin-board.
- **VERIFY:** `cd apps/frontend && npx tsc -b` EXIT 0 · `npx vite build` EXIT 0 · verify-factoring-profile-admin-board PASS (+ --selftest) · canonical-factor-profile · ft5 · no-nested-box · factor-admin parity/create-vocab
- **LIVE PROOF:** UNVERIFIED: coding-only — no Chrome
- **NEXT:** continue fill-not-shell (remaining Factoring bare cards / Settlements / Fuel)
- **Files Modified:** FactoringProfilePanel.tsx · FactorAdmin.tsx · verify-factoring-profile-admin-board.mjs · OUTBOX-CURSOR.md

