# CURSOR — FINAL-3 (10-25-2026 6:00 PM CT) · law: docs/bus/lead/ALL-CODERS-FINAL-3-LAW.md

Your register rows measured 0 pending at 5:40 PM. New work, top to bottom — FULLY BUILT, NOT SHELLS: every converted popup
keeps its engine calls, validation, save/void paths and error states; a screen that renders but is not wired is not done.

| # | Item | Done = |
|---|---|---|
| 1 | 443.365-A (your half) — 15 hand-built overlays -> shared `<Modal>` (decision = size="sm") or `<ParityDrawer>` | your files: components/checks/WriteCheckForm, pages/accounting/AllocationsPage, DisputeQueuePage, DisputesHubPage, ExpenseCategoryMapPage, FixedAssetsPage, PrepaidExpensesPage, ReclassifyTransactionsPage, RevenueRecognitionPage, loans/LoanApplicationWizard, pages/banking/components/BankingTransactionsDesignView, CategorizeDrawer, PrintOrientationDialog, pages/cash-advances/components/MarkDisbursedModal, pages/factoring/FactorAdmin. Each removed from `scripts/verify-popups-one-format.baseline.json` in the same PR |
| 2 | Hand-typed field heights outside popups (page-level forms) in your modules (accounting, banking, factoring, settlements, driver-finance) | page forms use FORM_INPUT_CLASS (40px) / filters FILTER_CONTROL_SIZE_CLASS (34px); count before/after in the PR |
| 3 | Re-measure your 443.280 board rows on main; any board still LAYERED/PARTIAL vs docs/design/v3 | rebuilt, not layered |

Every PR: `tsc -b` + `vite build` exits pasted (web build_failed 4 times today from Cursor PRs). Then "Cursor DONE" + PR list
in docs/bus/OUTBOX-CURSOR.md.
