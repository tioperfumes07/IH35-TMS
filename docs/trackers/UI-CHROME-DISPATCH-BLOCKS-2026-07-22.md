# 99 — Dispatch-ready blocks (from 2026-07-22 chrome audits)

Owner confirms GO before build. Cursor builds; no mass rewrite without ordered blocks.

## Chrome — filters (QBO collapse)

| Block id | Scope | Evidence |
|----------|-------|----------|
| **CHROME-01-SAFETY-FILTER-COLLAPSE** | ✅ **DONE on main** via PR #3200 (`8d5a50c6e`) — `SafetyDashboardFilter` collapsed; guards `verify-safety-filter-chrome` + `verify-qbo-filter-collapse` PASS | Filter matrix S0 #1; verified 2026-07-22 |
| **CHROME-02-QBO-FILTER-TOOLBAR** | ✅ **PR #3209** (`993b0fbda`) — Dispatch FilterBar + SafetyDashboardFilter delegate to shared `CollapsedListFilters` | Gold pattern never rolled back onto its origins |
| **CHROME-03-ACCOUNTING-LIST-FILTERS** | Bills/Invoices/Expenses/Payments/JE/DailyRecon/Register — Filter icon panel | Matrix S2 |
| **CHROME-04-CUSTOMERS-VENDORS-CHIPS** | Move list chips behind Filters; keep gear | Matrix S3 |
| **CHROME-05-UNIVERSAL-FILTERBAR** | ✅ **PR #3207** (`caabefa29`) — collapsed onto `CollapsedListFilters`; badge `defaultPeriod` fix; Columns stub stays removed | UniversalFilterBar DIRTY → fixed |
| **CHROME-06-MAINT-FLEET-OPS** | ✅ **PR #3214** (`3b2390696`) — WO / FleetTable / Road Service / Driver Reports / Maint KPI / Defects Inbox → `CollapsedListFilters`; ArrivingSoon already gold | Matrix S4 |
| **CHROME-07-REPORTS-AUDIT** | Collapse where QBO allows; document report-param exceptions | Reports/Audit DIRTY |

## Chrome — creators / boxes

| Block id | Scope |
|----------|-------|
| **CHROME-10-FLATTEN-BILL-EXPENSE** | Remove nested borders in VendorBillForm + CostBreakdownBox |
| **CHROME-11-NESTED-CREATE-DRAWER** | ✅ **PR #3208** (`b15f42dd2`) — `CreateDriverModal shell="drawer"` for VendorBill nested +Create; guard `verify-chrome-11-nested-create-drawer` | Remaining: CHROME-12 modal→drawer shells |
| **CHROME-12-MONEY-MODAL→DRAWER** | ✅ **PR #3210** (`7dafad82c`) — `BankTransactionSplitModal` → ParityDrawer; guard locks 9 money surfaces. Deferred shells → CHROME-14 | Receive Payment / Invoice / JE / Transfer / CC already drawers |
| **CHROME-13-BILLPAY-UNIFY** | ✅ **PR #3212** — PayBill / RecordCC / AP BillPayment sticky footer chrome. **Reconcile with #3213:** owner GO flipped `CC_BILL_PAYMENT_GATED` → false — chrome-13 guard must assert `false`, not `true` | Sticky footers |

## Catalog + Create (already audited)

| Block id | Scope |
|----------|-------|
| **PLUS-01-MONEY-REFERENCESELECT** | VendorBill AP/Class, RecordPayment Customer, Expense payment acct/unit, ExpenseCategoryMap UUID |
| **PLUS-02-BANKING-MODALS** | CC, transfers, cash-GL, rules, reconcile |
| **PLUS-03-LISTS-JE-CLASS** | ItemEditor preferred vendor + class; ManualJE class |
| **PLUS-04-OPS-PICKERS** | WO vendor; factoring lender; dispatch wizards last |

## Integrity (from prior audits — not chrome-only)

| Block id | Scope |
|----------|-------|
| **SAFETY-ACCIDENT-PERSIST** | Accident drawer money/claim fields actually save |
| **SAFETY-FINE-DRILLTHROUGH** | Liability + bank payment EntityLinks |

## Recommended first GO

1. **CHROME-01-SAFETY-FILTER-COLLAPSE** (proves the pattern Jorge pointed at)  
2. **PLUS-01-MONEY-REFERENCESELECT** (money +Create + Class/UUID bugs)  
3. **CHROME-10** + **CHROME-11** (boxes + nested create — why “side panel fix” still feels wrong)
