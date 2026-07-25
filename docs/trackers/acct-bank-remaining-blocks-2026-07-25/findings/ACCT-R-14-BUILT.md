# ACCT-R-14 — BUILT

**block_id:** `audit4-tax-return-automation`  
**Verdict:** BUILT (sales-tax submodule — not corporate/income tax return)  
**Date:** 2026-07-25

## Evidence

- `apps/backend/src/accounting/sales-tax/sales-tax.routes.ts` — default `fastify-plugin` export
- `apps/backend/src/accounting/index.ts` — autoload `matchFilter: /\.routes\.(ts|js)$/` + `registerAccountingRoutes` called from `apps/backend/src/index.ts`
- FE: `SalesTaxPage` + accounting subnav "Sales tax"
- Neon: `accounting.sales_tax_returns` table exists (0 rows at verify time)
- `scripts/verify-acct-r14-sales-tax-autoload.mjs`
- `scripts/verify-steps/1486-verify-acct-r14-sales-tax-autoload.mjs`
