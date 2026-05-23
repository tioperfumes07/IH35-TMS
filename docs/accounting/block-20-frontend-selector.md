# Block-20.2 Frontend Basis Selector

## Scope

This cut exposes the frontend basis selector and wires request parameters to report pages that are allowed to toggle between accrual and cash basis.

## Selector Placement

`BasisSelector` appears only on:

- `apps/frontend/src/pages/reports/BalanceSheetPage.tsx`
- `apps/frontend/src/pages/reports/TrialBalancePage.tsx`
- `apps/frontend/src/pages/reports/ProfitLossPage.tsx`
- `apps/frontend/src/pages/reports/ReportsHome.tsx`

Default basis is always `Accrual` on page load with no localStorage and no per-user persistence (Q7).

## Locked Decision Mapping

- Q7: selector defaults to accrual and does not persist.
- Q2: Balance Sheet cash mode surfaces `Cash Basis Adjustment` under equity.
- Q3: Trial Balance cash mode keeps AR/AP rows visible with zero balances.
- Q4: AR/AP Aging remain accrual-only surfaces (no selector).
- Q8: IFTA remains accrual-only (no selector).

## Accrual-Only Surfaces

No selector is rendered on:

- `apps/frontend/src/pages/reports/CashFlowStatementPage.tsx`
- `apps/frontend/src/pages/reports/ARAgingPage.tsx`
- `apps/frontend/src/pages/reports/APAgingPage.tsx`
- `apps/frontend/src/components/reports/IftaPreparerCard.tsx` (IFTA surface)

Each accrual-only surface includes inline note text:

`This report is always accrual basis per CPA sign-off.`

## Guard + Tests

- Guard: `scripts/verify-basis-selector-allowed-pages.mjs`
  - enforces selector appears only on allowed pages
  - blocks selector usage on cash-flow, AR/AP aging, and IFTA surfaces
  - verifies accrual-only note text appears on non-toggle surfaces
- Unit test: `apps/frontend/src/components/accounting/__tests__/BasisSelector.test.tsx`
  - renders both buttons
  - verifies default accrual selection
  - verifies callback values
  - verifies no localStorage writes
