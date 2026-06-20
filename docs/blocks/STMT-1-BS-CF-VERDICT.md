# STMT-1 — Balance Sheet + Cash Flow (display layer) — verdict

**Block:** AUTO-20 (LANE D · ACCOUNTING display — read-only, no posting/opening-balance writes)
**Tracker:** STMT-1 (row 1160)
**Date:** 2026-06-18

## Verdict: already shipped and rendering real numbers read-only in current main
The STMT-1 display layer exists end-to-end. Both statements consume the **existing** report endpoints
and render real data — no new posting, no opening-balance writes (that's STMT-2, not in this run, and the
fence is respected because nothing needed building).

## Balance Sheet — `pages/reports/BalanceSheetPage.tsx` → `GET /api/v1/accounting/balance-sheet`
- Fetches via `getBalanceSheetReport({ operating_company_id, as_of_date, basis })`, `enabled` on company.
- Renders **Assets / Liabilities / Equity** line tables (account # / account / amount) with section totals,
  plus KPI cards: Assets, Liabilities+Equity, and a **Balanced / Out-of-balance** check.
- **Basis selector** (`BasisSelector`) defaults to **accrual**; cash basis surfaces the Cash Basis
  Adjustment equity line. (Matches the locked rule: BS supports cash + accrual.)
- As-of date picker + Apply; **Export PDF / XLSX**; print stylesheet; error banner
  (`ReportBlockTPendingBanner`), loading, and empty ("No rows") states.

## Cash Flow Statement — `pages/reports/CashFlowStatementPage.tsx` → `GET /api/v1/accounting/cash-flow`
- Fetches via `getCashFlowStatementReport({ operating_company_id, … })`, `enabled` on company.
- Renders **Operating / Investing / Financing** sections with lines + section totals, plus KPIs:
  **Net cash change, Cash at start, Cash at end**.
- **Accrual basis only** — by design, "always accrual basis per CPA sign-off" (so no basis selector here,
  consistent with the locked decision that Cash Flow remains accrual-only).
- Export PDF / XLSX; error banner, loading, and empty states.

## Discoverability (read-only, already wired)
- Routed in `routes/manifest.tsx`: `/reports/balance-sheet`, `/reports/cash-flow-statement`.
- Listed in **`ReportsHome.tsx`** (`["balance-sheet","Balance sheet"]`,
  `["cash-flow-statement","Cash flow statement"]`) and in **`ReportsSubNav.tsx`**, so both are reachable
  from the Reports hub and the statements sub-nav.

## Acceptance — met
- BS + CF **render real numbers read-only** from existing endpoints. ✔
- Basis handling correct (BS accrual-default selector; CF accrual-locked). ✔
- No new posting, no opening-balance/GL writes — STMT-2 fence respected. ✔
- Docs-only verdict; CI green.

## Note for STMT-2 (Tier 1, NOT this run)
Opening-balance entry and any GL-writing for these statements is **STMT-2**, owner-entered, gated — do not
build solo. When numbers look thin, that is the opening-balance gap (a data/STMT-2 matter), not a display
defect in STMT-1.
