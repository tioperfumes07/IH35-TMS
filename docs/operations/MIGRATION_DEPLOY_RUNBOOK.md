# Migration Deploy Runbook

This runbook prevents the "code deployed but migrations not applied" incident class.

## Canonical ledger decision

- **Canonical migration ledger:** `_system._schema_migrations`
- **Mirror ledger (operational copy):** `ih35_migrations.applied_migrations`
- The migration runner (`scripts/db-migrate.mjs`) writes to both ledgers on every apply/backfill so they cannot silently diverge.
- Drift checks treat any canonical/mirror divergence as a blocking issue.

Rationale:

- `_system._schema_migrations` is the long-lived ledger already used by the runner and startup verification paths.
- Keeping one canonical source of truth removes ambiguity.
- `ih35_migrations.applied_migrations` is still maintained for tooling/reporting and historical compatibility.

## Standard deploy sequence (Render + Neon)

1. Deploy code to `main` (Render build/deploy path).
2. Run migrations against production Neon:
   - `DATABASE_DIRECT_URL=<production-neon-url> npm run db:migrate`
3. Run drift check against production Neon:
   - `DATABASE_DIRECT_URL=<production-neon-url> npm run db:check-drift`
4. Confirm internal migration status endpoint:
   - `GET /api/v1/internal/migrations/status` (Owner/Administrator auth required)
   - Must show:
     - `missingInDB: []`
     - `ledgerDivergence.onlyInCanonical: []`
     - `ledgerDivergence.onlyInMirror: []`
     - `checksumMismatches: []` (or only approved overrides)

## Drift check meanings

`npm run db:check-drift` reports:

- `PENDING` — file exists on disk but missing in canonical ledger.
- `UNLOGGED_MIRROR` — file is in mirror ledger but missing in canonical ledger.
- `UNLOGGED_SCHEMA` — file missing in canonical ledger but migration-declared objects already exist in schema (likely manual apply / unlogged apply).
- `CHECKSUM_DRIFT` — ledger checksum differs from on-disk checksum.
- `CANONICAL_ONLY` / `MIRROR_ONLY` — ledger divergence between canonical and mirror ledgers.

If any of the above are present (except approved checksum overrides), treat as a release blocker.

## CI guardrail

CI includes:

- `npm run db:migrate`
- `npm run db:check-drift`

This surfaces migration-state issues early against a clean database and ensures runner/ledger consistency is always validated.
