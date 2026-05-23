# Block-35 Chart of Accounts Roles

## Scope

Block-35 formalizes company-scoped chart-of-accounts role mappings so accounting engines can resolve control/default accounts by role instead of ad-hoc string matching.

## Implemented

- Added migration `db/migrations/0223_block_35_chart_of_accounts_roles.sql`:
  - creates `accounting.chart_of_accounts_roles`
  - role enum for required accounting roles
  - active unique invariant per `(operating_company_id, role)`
  - RLS + grants
- Added resolver service `apps/backend/src/accounting/coa-roles/resolver.service.ts`:
  - `resolveRoleAccount(...)` fail-fast API
  - `resolveRoleAccountOptional(...)` compatibility API for transitional no-behavior-change refactors
- Added CoA roles API routes `apps/backend/src/accounting/coa-roles/routes.ts`:
  - `GET /api/v1/accounting/coa-roles`
  - `PUT /api/v1/accounting/coa-roles`
  - `GET /api/v1/accounting/coa-roles/validate`
- Refactored callers:
  - posting engine account resolution now uses role resolver (`ar_control`, `ap_control`, `cash_clearing` / `undeposited_funds`, `revenue_default`, `expense_default`)
  - cash-basis report transforms now consume role-informed AR/AP matching from callers
  - balance-sheet/trial-balance cash-basis callers and period snapshot writer now resolve AR/AP role accounts first
- Added frontend role management page:
  - `apps/frontend/src/pages/accounting/CoaRolesPage.tsx`
  - route: `/accounting/settings/coa-roles`
  - settings sub-nav entry under Accounting
  - includes "Validate" action for required role coverage
- Added Block-35 static guard:
  - `scripts/verify-coa-roles-no-string-match-bypass.mjs`
  - wired into `scripts/verify-architectural-design.ts`
- Added Vitest coverage:
  - `apps/backend/src/accounting/coa-roles/__tests__/resolver-tenant-isolation.test.ts`
  - `apps/backend/src/accounting/coa-roles/__tests__/resolver-missing-role-fail-fast.test.ts`

## Deploy order

DEPLOY ORDER: merge after Block-34. Pure formalization of CoA roles with compatibility fallback preserved during rollout.
