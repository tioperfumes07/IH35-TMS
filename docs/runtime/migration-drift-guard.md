# Startup Migration Drift Guard

## What It Does

`apps/backend/src/db/startup-migration-drift-guard.ts` runs during backend startup and compares:

- SQL files in `db/migrations/*.sql`
- `_system._schema_migrations.filename`
- `ih35_migrations.applied_migrations.name`

The backend process exits with status `1` when any migration file is missing from either ledger. This prevents a deploy from reaching green/Live while schema state is behind the repository.

## Why It Exists

On 2026-05-23, a production deploy reached Live while migration `0215` remained unapplied because Render pre-deploy migration execution was not enforced. This guard closes that class of silent drift by failing boot immediately.

## Local Verification

1. Build and verify:

```bash
npm run build:backend
cd apps/frontend && npx tsc -b && cd ../..
npm run verify:arch-design
```

2. Run the dedicated static assertion:

```bash
npm run verify:startup-migration-drift-guard
```

3. Run targeted unit tests:

```bash
vitest run --config apps/backend/vitest.config.ts apps/backend/src/db/__tests__/startup-migration-drift-guard.test.ts
```

## Bypass Variable (Debug Only)

- Env var: `SKIP_MIGRATION_DRIFT_GUARD=true`
- Effect: logs a bypass warning and continues startup.
- Allowed use: local debugging or temporary investigation only.
- Forbidden use: any Render production/staging service environment.

## Related CI Protections

- Runtime boot guard: `runStartupMigrationDriftGuard(...)` in `apps/backend/src/index.ts`
- Static wiring/config guard: `scripts/verify-startup-migration-drift-guard.mjs`
- Architectural chain integration: `npm run verify:arch-design`

