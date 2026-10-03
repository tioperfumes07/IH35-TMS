# LEAD AUDIT — 2026-10-02 — QBO NUMBER FORMAT AND CALENDARS, MEASURED ACROSS 1,935 FILES

OWNER: "CALENDARS QUICKBOOKS STYLE THROUGHOUT THE ENTIRE APP, QBO NUMBER FORMATS ETC."
**He is right about the numbers, and the worst of it is on the financial statements. He is mostly
wrong about the calendars, and I say so rather than invent work.**

## THE CANONICAL MODULE ALREADY EXISTS — NOBODY HAS TO INVENT IT

`apps/frontend/src/lib/money.ts` is the single source of truth and it is already correct: QBO style
`$1,234.56`, thousands separators on plain counts, **C-35** never emits `-$0.00`, **C-37** table cells
use accounting parentheses for negatives and render missing as `—` and never a fabricated `$0.00`, and
**D48** every money COLUMN takes `QBO_MONEY_CELL_CLASS` from `design/qbo-parity.ts` for right-align +
`tabular-nums`. Its own header says it: *"do NOT hand-roll toFixed(2), toLocaleString, or per-file
Intl.NumberFormat money variants."*

**That instruction is being ignored at scale.**

```
MEASURED on origin/main, 1,935 frontend source files:

  Hand-rolled money/number formatting that does NOT import lib/money
        183 files · 294 occurrences
  Money rendered in a TABLE with no QBO alignment (right-align + tabular-nums)
         20 files
  Raw native <input type="date"> outside the house DateTimePicker
          9 files · 11 inputs — and 5 of those are the house component, its tests, and the two
                                 date libraries themselves
```

## THE 20 ALIGNMENT FILES ARE THE FINANCIAL STATEMENTS. THAT IS THE HEADLINE.

```
pages/reports/BalanceSheetPage.tsx          pages/reports/ProfitLossPage.tsx
pages/reports/TrialBalancePage.tsx          pages/reports/ProfitPerTruckPage.tsx
pages/reports/ARAgingPage.tsx               pages/reports/APAgingPage.tsx
pages/reports/CashFlowStatementPage.tsx     pages/reports/CashFlowOverviewPage.tsx
pages/reports/CounterpartyStatementPage.tsx pages/reports/CustomerProfitabilityPage.tsx
pages/reports/FuelReconciliationPage.tsx    pages/reports/MaintenanceCostPerUnitPage.tsx
pages/reports/ManagementReportPackagePage.tsx pages/reports/SettlementSummaryPage.tsx
pages/finance/FinancialStatementsPage.tsx   pages/home/OwnerHome.tsx
pages/home/roles/DefaultHome.tsx            components/checks/WriteCheckForm.tsx
components/dispatch/LoadDetailDrawer.tsx    components/reports/ThreeMileCpmPanel.tsx
```

**Balance Sheet, P&L, Trial Balance, both Agings and both Cash Flow pages print money in ragged,
proportional-width columns.** These are the exact pages a CPA, a lender or an insurer opens first. In
QuickBooks every one of those columns is right-aligned with lining figures so the decimal points stack
and the eye can add a column down the page. Ours do not. **This is the single highest-value visual fix
in the app and it is a class fix, not twenty separate ones.**

## CALENDARS — THE HONEST ANSWER: THIS IS ALREADY CENTRALIZED, DO NOT CHURN IT

`components/forms/DateTimePicker.tsx` is the house component and it is used nearly everywhere. The
only real offenders are **four pages** holding a raw native input:

```
pages/CustomerDetail.tsx        pages/accounting/MonthClosePage.tsx
pages/finance/AmortizationPage.tsx   pages/accounting/loans/LoanApplicationWizard.tsx
pages/reports/runners/RunnerFilters.tsx   (filter range — fix with the ROUND 290 filter work)
```

**Four pages, not "the entire app."** I am not going to invent a calendar rebuild to look busy. The
work is: those four to the house picker, and the house picker itself audited against the design law —
**34px control height, 40px when edited, 132px date column width, Save and Close on anything that
opens, em dash for missing** — plus the QBO date presets the filter toolbar already exposes through
`applyUniversalDatePreset()` (today, this week, this month, this quarter, this year, custom), because
that preset row is the thing QuickBooks users actually reach for and it belongs on every date filter.

## ASSIGNED — CLASS FIX FIRST, THEN THE TAIL

### CC-2 — THE FINANCIAL STATEMENTS AND THE MONEY TABLES — **this is the headline, take it first**
All 20 alignment files above, plus the accounting/banking share of the 183. Every money column gets
`QBO_MONEY_CELL_CLASS`; every amount imports from `lib/money`; negatives in table cells become
accounting parentheses in red per C-37; missing becomes `—`, never a fabricated `$0.00`. **120px money
columns, 132px dates.** Then one guard: **a money value rendered in a table cell without
`QBO_MONEY_CELL_CLASS` fails the push.** That guard is what stops the 294 from coming back.

### CC-1 — DRIVER PAY AND DISPATCH MONEY
`components/dispatch/PreSettlementPanel.tsx` (8), `LoadDetailDriverPayTab.tsx` (6),
`driver-finance/components/*` — `LiabilityBreakdownModal` (6), `EarningsSection`, `SettlementsTable`,
`FuelPurchasesSection`, `DebtBanner`, `DeadheadPaySection` (4 each), `NetPaySummary` (3),
`cash-advances/components/AdvanceDetailDrawer.tsx` (5), `CreateAdvanceModal` (3), `DriverDetail.tsx`
(3), `liabilities/components/*` (5+5), `forms/shared/CostBreakdownBox.tsx` (5).
`DeadheadPaySection` is the same file as the deadhead defect in ROUND 288.3 — **one pass, not two.**

### CC-3 — FUEL, MAINTENANCE, SAFETY AND THE CATALOGS
`fuel/FuelTransactionsTable.tsx` (4), `fuel/components/TripPlanSummaryBanner.tsx` (4),
`maintenance/components/CreateWOSectionCostBreakdown.tsx` (3), `safety/tabs/EscrowRecordTab.tsx` (5),
`dispatch/AtRiskQueuePage.tsx` (3), plus the catalog lists from ROUND 290.
**`EscrowRecordTab` is DRIVER escrow — a 2100-series current liability. Nothing factoring goes near it.**

### CURSOR — THE FOUR CALENDARS AND THE FORMS
The four raw native date inputs to the house `DateTimePicker`; `RunnerFilters.tsx` in the same pass as
its ROUND 290 filter; `banking/components/ManualJEModal.tsx` (4) and
`dispatch/components/BookLoadModalV4.tsx` (4); and the QBO preset row on every date filter.

## WHAT DONE MEANS

Every amount through `lib/money`. Every money column right-aligned with `tabular-nums` at 120px, dates
at 132px. Negatives in accounting parentheses, missing as `—`, never `-$0.00` and never a fabricated
zero. **One guard per class so the 294 cannot come back.** Nothing posts, nothing is seeded, nothing is
fed. 100% per seat, no handoffs. The owner verifies in Chrome when every build is complete.

REPORT: PR numbers, gate exit 0, deploy SHA, the guard name, and the before/after count — occurrences
of hand-rolled formatting in your lane, and money-in-table files without QBO alignment. **The number
must go to zero in your lane, not down.**
