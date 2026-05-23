# Block-43: Live-DB schema verification

## Scope

Block-43 adds a dedicated live-database verifier for critical accounting schema objects and migration-ledger alignment.

## What shipped

- Added `scripts/db-verify-live-schema.mjs`
  - Connects using `DATABASE_DIRECT_URL` (fallback `DATABASE_URL`)
  - Verifies repo migration files are present in both ledgers:
    - `_system._schema_migrations`
    - `ih35_migrations.applied_migrations`
  - Verifies critical table presence for accounting/QBO/reconciliation/factoring domains
  - Verifies critical column presence for those tables
  - Verifies RLS enabled on critical live-schema tables
- Added package script:
  - `db:verify:live-schema`
- Added static guard:
  - `scripts/verify-live-db-schema-script-wiring.mjs`
  - Wired into `scripts/verify-architectural-design.ts`

## Why this block

- This block is independent and can run anytime against a live database.
- It gives a single deterministic command to validate that schema rollout and table contracts are actually present in production-like environments.

## Verify

- `npm run build:backend`
- `cd apps/frontend && npx tsc -b`
- `npm run verify:arch-design`
- `node scripts/verify-live-db-schema-script-wiring.mjs`
- Optional live check when DB env vars are available:
  - `npm run db:verify:live-schema`
