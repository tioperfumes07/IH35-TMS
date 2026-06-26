# GAP-44 — Form 425C Exhibits A–F Auto-Build

**Block ID:** GAP-44  
**Phase:** GAP-HIGH  
**Wave:** G-U (Lane A)  
**Classification:** ADDITIVE (financial / bankruptcy court filing)

## Purpose

Form 425C monthly operating reports for TRANSP Chapter 11 DIP filings require six supporting exhibits (A–F). This block auto-builds each exhibit from TMS accounting and banking data so operators no longer manually print and attach inconsistent PDFs.

## Exhibits

| Letter | Title | Data source |
|--------|-------|-------------|
| A | Cash receipts detail | `banking.bank_transactions` (inflows), grouped by source type |
| B | Cash disbursements detail | `banking.bank_transactions` (outflows), grouped by vendor + category |
| C | Bank reconciliation | `banking.bank_accounts` + balances + period activity |
| D | U.S. Trustee quarterly fee | Disbursement total × **28 U.S.C. § 1930(a)(6)** tier table |
| E | Statements summary | Existing P&L, balance sheet, and cash flow services |
| F | Supporting docs list | `accounting.invoices`, `accounting.bills` + `evidence.files` |

## API

- `POST /api/v1/reports/form-425c/exhibits/build`
- `GET /api/v1/reports/form-425c/exhibits/:filing_uuid`
- `GET /api/v1/reports/form-425c/exhibits/:filing_uuid/exhibit/:letter`

Owner / Administrator / Accountant RBAC on all routes.

## UI

- `/reports/form-425c/exhibits` — tabbed `ExhibitsViewer` with per-exhibit JSON export
- `ExhibitCard` components for A–F selection

## CI guard

```bash
npm run verify:form-425c-exhibits
```

## Related

- Form 425C main page: `/425c`
- GAP-45 (Lane B) owns cash-flow / per-truck CPM route fixes — disjoint paths

--- ARTIFACTS ON MAIN (evidence for reconcile classifier) ---
STEP-0 full-tracker reconciliation 2026-06-26: BUILT on main. Real signature artifacts (verified present):
  - apps/frontend/src/pages/form425c/Form425CHome.tsx
  - apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx
