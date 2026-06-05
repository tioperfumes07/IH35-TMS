# DEEP-AUDIT-B — /accounting/invoices 17-Tab Subnav Walk

**Block:** CLOSURE-15-DEEP-AUDIT-B (Lane A)  
**Date:** 2026-06-05 (CST / Laredo)  
**Base SHA:** `cd467c30a` (dispatch)  
**Entry point:** `/accounting/invoices` (`InvoicesListPage` + `AccountingSubNav`)  
**CI guard:** `npm run verify:deep-audit-b-invoices-subnav`

## 17-tab inventory (PASS-5 H6)

Subnav source: `subnav-manifest.ts` → `AccountingSubNav` (`HoverDropdownNav`).

| # | Tab | Path | Route mount | Page renders | Subnav on page | Filters / actions (static) |
|---|-----|------|-------------|--------------|----------------|----------------------------|
| 1 | Bills▾ | `/accounting/bills` (+ 6 children) | **PASS** | **PASS** (`BillsPage`) | Wrapper tabs* | Category filters, bulk, create |
| 2 | Settlements▾ | `/accounting/dispute-queue`, `/accounting/abandonment-queue` | **PASS** | **PASS** | **PASS** | Queue filters |
| 3 | Expenses | `/accounting/expenses` | **PASS** | **PASS** (`ExpenseCreatePage`) | **FAIL** — no `AccountingSubNav` | Record expense form |
| 4 | Bill payment | `/accounting/bill-payments` | **PASS** | **PASS** | **PASS** | List + pay actions |
| 5 | Maintenance & shop | `/accounting/maintenance-shop` → `/maintenance` | **PASS** (redirect) | **PASS** | Module nav† | WO list |
| 6 | Vendors | `/accounting/vendors` → `/vendors` | **PASS** (redirect) | **PASS** | Module nav† | List view toggle (AF-3) |
| 7 | Customers | `/accounting/customers` → `/customers` | **PASS** (redirect) | **PASS** | Module nav† | Pagination (AF-13) |
| 8 | Reports | `/accounting/reports` → `/reports` | **PASS** (redirect) | **PASS** | Module nav† | Report picker |
| 9 | AR Aging | `/reports/ar-aging` | **PASS** | **PASS** (`ARAgingPage`) | Reports shell† | Date/as-of filters |
| 10 | Collections | `/accounting/collections` | **PASS** | **PASS** | **PASS** | AR collections table |
| 11 | AP Aging | `/reports/ap-aging` | **PASS** | **PASS** (`APAgingPage`) | Reports shell† | Date filters |
| 12 | Invoices | `/accounting/invoices` | **PASS** | **PASS** | **PASS** | Status filter, bulk, create modals |
| 13 | Multi-entity | `/accounting/multi-entity` | **PASS** | **PASS** | **PASS** | Entity switcher |
| 14 | Receive Payment | `/accounting/payments` | **PASS** | **PASS** | **PASS** | Payment list/create |
| 15 | Factoring | `/accounting/factoring` | **PASS** | **PASS** | **PASS** | List + power-user UX (AF-17) |
| 16 | Faro CSV import | `/factoring/faro-import` | **PASS** | **PASS** (`FaroImportPage`) | **FAIL** — no `AccountingSubNav` | Preview/commit import |
| 17 | Factor reconciliation | `/accounting/factor-reconciliation` | **PASS** | **PASS** | **PASS** | Reconciliation workflow |

\* `BillsPage` uses legacy `AccountingSubNavWrapper` (12 horizontal tabs) — different chrome than invoice-context `HoverDropdownNav`.  
† Canonical module pages use their own nav; accounting hover subnav is not persisted after redirect.

## Bills dropdown children (7)

`/accounting/bills`, `/maintenance`, `/repair`, `/fuel`, `/driver`, `/vendor`, `/multiple` — all in `SUBNAV_ITEMS`, routes mounted.

## Settlements dropdown children (2)

`Dispute queue`, `Abandonment queue` — routes mounted, `AccountingSubNav` on page components.

## Deep-link / active state

`accountingSubNavActiveHref` keeps **Invoices** tab highlighted on `/accounting/invoices/:id` — **PASS** (AF-14 pattern).

## Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| B-INV-1 | **HIGH** | **Expenses** tab navigates to create-only page without `AccountingSubNav` — user loses 17-tab context. | `ExpenseCreatePage.tsx` |
| B-INV-2 | **HIGH** | **Faro CSV import** leaves accounting subnav — factoring module header only. | `FaroImportPage.tsx` |
| B-INV-3 | **MEDIUM** | Four tabs redirect to canonical modules (Vendors, Customers, Reports, Maintenance & shop) — subnav swaps to module nav; disorienting when entered from Invoices. | `manifest.tsx` redirects |
| B-INV-4 | **MEDIUM** | AR/AP Aging live under `/reports/*` not `/accounting/*` — correct routes but accounting subnav not shown on aging pages. | `ARAgingPage`, `APAgingPage` |
| B-INV-5 | **LOW** | Bills landing uses `AccountingSubNavWrapper` vs `AccountingSubNav` on invoice pages — two accounting chrome patterns. | `BillsPage.tsx` vs `InvoicesListPage.tsx` |

**CRITICAL:** None — all 17 targets resolve to real routes; no blank screens detected in static walk.

## CI guard

`scripts/deep-audit-b-invoices-subnav.mjs` asserts all 17 paths in subnav manifest, route manifest mounts, Bills/Settlements children, and `AccountingSubNav` on core invoice-context pages.
