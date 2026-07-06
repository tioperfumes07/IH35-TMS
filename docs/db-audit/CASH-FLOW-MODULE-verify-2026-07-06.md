# Cash Flow Module — Live-Wiring Verify Note (2026-07-06)

**Docs-only. No code change.** Verified the module already exists and is wired end-to-end; per
instruction, did **not** rebuild it.

## Verdict: LIVE and WIRED, no gap found

`GET /api/v1/accounting/cash-flow` (`apps/backend/src/accounting/cash-flow.routes.ts`,
`registerCashFlowRoutes`) is registered on boot even though nothing in `index.ts` imports it directly:
`accounting/index.ts` → `registerAccountingRoutes()` uses `@fastify/autoload` with
`matchFilter: /\.routes\.(ts|js)$/` over the whole `accounting/` directory, so every `*.routes.ts` file
there — including `cash-flow.routes.ts` — is auto-registered as a plugin. `registerAccountingRoutes()`
itself is called from `apps/backend/src/index.ts:999`. Confirmed this is a real registration path, not
an assumption, by tracing the autoload config and the call site.

Frontend chain, traced end-to-end:
- Route: `/reports/cash-flow-statement` (`apps/frontend/src/routes/manifest.tsx:2769`) →
  `CashFlowStatementPage` (`apps/frontend/src/pages/reports/CashFlowStatementPage.tsx`).
- The page calls `getCashFlowStatementReport()` (`apps/frontend/src/api/reports.ts:456`), which hits
  `GET /api/v1/accounting/cash-flow?operating_company_id=...&from_date=...&to_date=...` — the exact
  endpoint above.
- Export buttons on the same page call the sibling `/api/v1/accounting/cash-flow/export/{pdf,xlsx}`
  routes (`accounting/statement-export.routes.ts`), which exist and are registered the same
  autoload way.

Backend service (`accounting/cash-flow.service.ts`, `getCashFlowReport`) computes real Operating /
Investing / Financing sections from journal-entry legs (`is_cash_account`, `account_subtype`
classification into `CASH_SUBTYPES` / `OPERATING_ASSET_SUBTYPES` / etc.), not a stub — it returns
`net_cash_change`, `cash_at_start`, `cash_at_end`, `reconciled`, and `unclassified_leg_count` (an
honesty signal for legs the classifier couldn't bucket, rather than silently dropping them).

Access control: `canAccessCashFlow()` gates the route to Owner/Administrator/Manager/Accountant roles,
plus `assertCompanyMembership()` — consistent with the rest of the accounting surface.

## Distinct from the cash-flow **module** (`/cash-flow`, daily prediction)

There is a second, separate cash-flow surface — `apps/backend/src/cash-flow/cash-flow.routes.ts`
(`/api/v1/cash-flow/daily-prediction`, `/actual-vs-projected`, `/adjustments`) backing the `/cash-flow`
page (`CashFlowPage.tsx`, PR #757, "Cash Flow module — daily prediction + Actual vs Projected"). That
module is unrelated to this verify pass's target (the accrual cash-flow **statement**, GAAP-style
Operating/Investing/Financing) — it is a forward-looking predictive tool, not a historical statement.
Both are real, both are wired; noting the distinction so a future reader doesn't conflate the two
"cash flow" surfaces in this codebase.

There is also a third, narrower `GET /api/v1/reports/cash-flow` (`reports/cash-flow/route-fix.ts`,
"GAP-45 route-fix") that exposes an opco-scoped bank-balance + load-count snapshot — smaller in scope
than the full statement, also live, also not the target of this note.

## What was NOT found to be a gap

No unmounted route, no orphaned frontend page, no stub service. The pattern this repo has repeatedly
hit elsewhere (module-catalog-2026-07-05 memory: "unmounted-backend epidemic," a route defined but
never imported) does **not** apply here — `@fastify/autoload` registration is a real, working
mechanism (confirmed by reading `accounting/index.ts` and the call site), not a false-green trap.

## No fix made

Per instruction ("verify it's live + wired; if a gap, fix it small; else write a 1-paragraph verify
note; do NOT rebuild") — no gap was found, so nothing was changed. This file is the verify note.
