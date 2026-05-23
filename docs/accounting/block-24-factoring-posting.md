# Block-24: Factoring posting

## Scope

Block-24 wires factoring lifecycle events into deterministic accounting posting paths using the existing payment posting backbone.

- Advance event posts as customer payment flow (`factoring_advance`): cash in, AR reduction.
- Customer-pays-factor release event posts as customer payment flow (`factoring_reserve`) for the net release amount.
- Factor fee mapping is resolved via Block-21 hook (`factoring_fee/default`) but remains non-blocking until Block-25 fee-specific posting logic.
- COA roles from Block-35 are consulted for AR/factor reserve policy alignment.

## VQ1 Option A alignment

Scenario 8 canonical values:

- Invoice issued: `$10,000`
- Factor advance received: `$8,000`
- Customer pays factor (release net of fee): `$1,800`
- Factoring fee: `$200` (handled in Block-25)

Block-24 posts the `$8,000` and `$1,800` cash-chain events through the same customer payment posting route so AR recognition follows cash timing and remains tenant-scoped.

## Files

- `apps/backend/src/accounting/factoring-posting/poster.service.ts`
  - New factoring posting hook for advance/release events.
  - Performs invoice-proportional allocation and customer grouping.
  - Creates/reuses payment records + applications and calls `postSourceTransaction` for ledger posting.
- `apps/backend/src/accounting/factoring-advances.routes.ts`
  - Calls factoring poster on `/advance` and `/release`.
- `apps/backend/src/accounting/factoring-posting/__tests__/poster-tenant-isolation.test.ts`
- `apps/backend/src/accounting/factoring-posting/__tests__/poster-scenario-8.test.ts`
- `scripts/verify-factoring-posting-uses-resolver-and-roles.mjs`
- `scripts/verify-architectural-design.ts`

## Guardrails

- Tenant context set via `set_config('app.operating_company_id', ...)`.
- Factoring advance lookups filtered by `operating_company_id`.
- Posting path uses `postSourceTransaction` with `source_transaction_type: "customer_payment"`.
- Resolver + role usage statically enforced in CI guard.

## Deploy order

Merge after Block-35.
First major Section C operation block.
