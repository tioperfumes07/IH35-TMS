# Block-25: Factoring fees and reserves

## Scope

Block-25 extends factoring accounting to explicitly handle fee and reserve mechanics on top of Block-24.

- Factoring fees are posted as their own positive expense line (VQ6), never netted against revenue.
- Reserve balances are exposed per customer for accounting visibility.
- Release flow now includes fee-expense journal creation when `factor_fee_cents > 0`.

## Locked decisions

- **VQ1 Option A:** factoring cash behavior remains Option A.
- **VQ6:** fees/refunds are separate expense lines, not revenue net-down.

## Implementation

- `apps/backend/src/accounting/factoring-fees-posting/poster.service.ts`
  - `postFactoringFeeExpenseEvent(...)`
    - Resolves fee account via Block-21 mapping (`factoring_fee/default`).
    - Resolves AR control via Block-35 role.
    - Creates an auto journal entry (Dr factoring fee expense, Cr AR when netted).
    - Idempotent by memo check per factoring advance.
  - `listFactorReserveBalances(...)`
    - Computes reserve accrued/released/current balances per customer.
    - Returns latest 10 reserve-related events for UI card context.
- `apps/backend/src/accounting/factoring-advances.routes.ts`
  - Adds `GET /api/v1/accounting/factoring-reserve-balances`.
  - Calls fee-expense poster on reserve release.
- `apps/frontend/src/pages/accounting/FactorReserveCard.tsx`
  - New reserve card with per-customer balances + latest reserve events.
- `apps/frontend/src/pages/accounting/FactoringDetailPage.tsx`
  - Embeds reserve card in factoring detail.

## CI + tests

- Guard: `scripts/verify-factoring-fees-not-netted-against-revenue.mjs`
- Wired guard in `scripts/verify-architectural-design.ts`
- Tests:
  - `apps/backend/src/accounting/factoring-fees-posting/__tests__/poster-tenant-isolation.test.ts`
  - `apps/backend/src/accounting/factoring-fees-posting/__tests__/poster-fee-as-expense.test.ts`
  - `apps/backend/src/accounting/factoring-fees-posting/__tests__/poster-reserve-balance.test.ts`

## Deploy order

Merge after Block-24.
