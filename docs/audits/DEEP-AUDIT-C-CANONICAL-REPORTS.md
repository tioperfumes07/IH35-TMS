# DEEP-AUDIT-C — Canonical Reports Walk

**Block:** CLOSURE-16-DEEP-AUDIT-C (Lane B)  
**Date:** 2026-06-08 (CST / Laredo)  
**Auditor:** Agent B (audit-only — no production source edits)  
**CI guard:** `npm run verify:deep-audit-c-reports`

## Scope

Eleven canonical financial/ops reports from the Reports landing page (PASS-5 H8). Each row documents route mount, primary filters, export surfaces, and spot-check notes from static + route-manifest review.

| # | Route | Page component | Date filter | Accrual/Cash | Export | Print | Drill-down |
|---|-------|----------------|-------------|--------------|--------|-------|------------|
| 1 | `/reports/balance-sheet` | `BalanceSheetPage` | ✅ period | ✅ BasisSelector | PDF/CSV | `@media print` | Row → GL |
| 2 | `/reports/trial-balance` | `TrialBalancePage` | ✅ as-of | ✅ | CSV | ✅ | Account link |
| 3 | `/reports/profit-loss` | `ProfitLossPage` | ✅ range | ✅ | PDF/CSV/XLSX | ✅ | Class rows |
| 4 | `/reports/cash-flow-statement` | `CashFlowStatementPage` | ✅ range | cash-only | CSV | ✅ | Section totals |
| 5 | `/reports/settlement-summary` | `SettlementSummaryPage` | ✅ pay period | n/a | CSV | ✅ | Driver row |
| 6 | `/reports/customer-profitability` | `CustomerProfitabilityPage` | ✅ range | accrual | CSV | ✅ | Customer link |
| 7 | `/reports/per-truck-cpm` | `PerTruckCpmReport` | ✅ month | n/a | CSV | ✅ | Unit drill |
| 8 | `/reports/fuel-reconciliation` | `FuelReconciliationPage` | ✅ 30d default | n/a | CSV | ✅ | Card txn |
| 9 | `/reports/ar-aging` | `ARAgingPage` | ✅ as-of | accrual | CSV/PDF | ✅ | Invoice link |
| 10 | `/reports/ap-aging` | `APAgingPage` | ✅ as-of | accrual | CSV/PDF | ✅ | Bill link |
| 11 | `/reports/ifta` | `IFTAPreparer` | ✅ quarter | n/a | CSV | ✅ | Jurisdiction |

## Per-report findings

### 1 — Balance Sheet (`/reports/balance-sheet`)

- **Loads:** Route mounted in `manifest.tsx`; `BalanceSheetPage` fetches `/api/v1/reports/balance-sheet`.
- **Filters:** As-of date + accrual/cash via `BasisSelector`.
- **Exports:** PDF via browser print; CSV download button present.
- **Spot-check:** Total assets = liabilities + equity within 1¢ on seeded TRANSP company (PASS-6 baseline).
- **Severity:** LOW — no subnav when opened from accounting invoices path (see DEEP-AUDIT-B B-INV-4).

### 2 — Trial Balance

- **Loads:** OK; debits = credits guard in API response.
- **Severity:** LOW — column resize not persisted.

### 3 — Profit & Loss

- **Loads:** OK; largest PASS-6 coverage report.
- **Severity:** MEDIUM — cash basis toggle hides some class rows without empty-state copy.

### 4 — Cash Flow Statement

- **Loads:** OK; distinct from `/reports/cash-flow` (GAP-45 prediction module).
- **Severity:** LOW — two “cash flow” routes may confuse operators; document in runbook.

### 5 — Settlement Summary

- **Loads:** OK; ties to `payroll.driver_settlements`.
- **Severity:** HIGH — team-split loads (CLOSURE-6) not always reflected in summary grouping (see E2E workflow 2).

### 6 — Customer Profitability

- **Loads:** OK.
- **Severity:** MEDIUM — excludes factored invoices until payment received (by design; flag in help).

### 7 — Per-Truck CPM (`/reports/per-truck-cpm`)

- **Loads:** OK post GAP-45 route fix.
- **Severity:** LOW — default month = current; no YTD toggle.

### 8 — Fuel Reconciliation

- **Loads:** OK; card feed vs WO linkage.
- **Severity:** MEDIUM — unmatched card rows lack bulk-assign action.

### 9 — AR Aging

- **Loads:** OK.
- **Severity:** LOW — opened from `/accounting/invoices` subnav without accounting chrome (B-INV-4).

### 10 — AP Aging

- **Loads:** OK.
- **Severity:** LOW — same subnav chrome gap as AR.

### 11 — IFTA Quarterly (`/reports/ifta`)

- **Loads:** OK; quarter picker + jurisdiction table.
- **Severity:** MEDIUM — PDF export uses browser print only (no server PDF).

## CRITICAL

None — all 11 routes mount real pages; no 404/500 on manifest inspection.

## HIGH

- **C-RPT-1:** Settlement Summary may under-count team-split secondary driver pay — see E2E workflow 2 and fix scope in summary.
