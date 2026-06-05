# Data Migration Runbook

Canonical runbook for adding, validating, and deploying SQL migrations in IH35-TMS.
This consolidates the lessons from [PR #175](https://github.com/tioperfumes07/IH35-TMS/pull/175) and DS-REMEDIATE-PROCESS-1 ([PR #173](https://github.com/tioperfumes07/IH35-TMS/pull/173)).

## 1) Migration naming and ordering rules

- Use file names in the form `NNNN[_suffix]_description.sql`, where:
  - `NNNN` is a zero-padded 4-digit sequence (`0001`, `0396`, etc).
  - Optional suffix letters (`a`, `b`, ...) are only for tightly-scoped insertions when a full renumber is not acceptable.
  - `description` is concise and specific to the schema change.
- Do not renumber previously merged migration files on disk.
- Do not edit migration ledger rows to match local renumber experiments.
- Never bypass ordering checks by adding a new migration with a lower number than the current mainline migration tail.

## 2) Migration self-containment requirements

Every migration must be safe to apply in a clean environment and explicit about security posture:

- Include schema creation/usage guards where needed (`CREATE SCHEMA IF NOT EXISTS`, `GRANT USAGE`).
- Use idempotent DDL patterns (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) whenever possible.
- Wrap conditional logic in explicit `DO $$ ... $$` blocks when runtime checks are needed.
- Include explicit grants for application roles (`ih35_app`) after creating new objects.
- Avoid hidden dependencies on local developer DB state or prior manual console operations.

## 3) Pre-commit checklist

Before commit/push, complete all of the following:

1. Update `.block-ready.json` with the block manifest and allowed file scope.
2. Run `npm run verify:ledger-parity-static`.
3. Run `npm run verify:no-unledgered-migrations`.
4. Run `node scripts/runbook-verify-migration-chain.mjs`.
5. Confirm no migration ledger cleanup is required for this PR (if orphan rows are present, use `docs/runbooks/migration-orphan-cleanup.md` and keep that privileged cleanup in a separate approved operation).

## 4) CI gate behavior (clean DB/file-scoped)

Migration-chain CI verification must remain green on `main` and in CI without depending on a developer's accumulated local DB state:

- The architecture gate uses static/file-scoped checks:
  - `verify:ledger-parity-static`
  - `verify:no-unledgered-migrations`
  - `node scripts/runbook-verify-migration-chain.mjs`
- Do **not** wire CI to a live local DB drift command (for example `db-check-drift.mjs`) because known local ledger artifacts can produce false drift.
- Treat local orphan rows as an operational cleanup item, not a migration-chain correctness failure for CI.

## 5) Production deploy procedure

1. Confirm Render `preDeploy` migration step is active for the target service/environment.
2. Deploy with standard migration automation (no ad-hoc SQL edits in production during rollout).
3. Verify both ledgers and schema health post-deploy:
   - `_system._schema_migrations`
   - `ih35_migrations.applied_migrations`
4. If drift is suspected, run `node scripts/runbook-detect-migration-drift.mjs --strict` against the target environment and follow the drift recovery runbook.

## 6) Rollback procedure (non-destructive)

- Preferred rollback path is Neon branch restore / point-in-time recovery.
- Never perform destructive schema rollback by dropping ledgers or manually deleting migration history.
- If replay is needed after restore/drift correction, use:
  - `docs/runbooks/MIGRATION-DRIFT-RECOVERY-RUNBOOK.md`
  - `docs/runbooks/SAFE-REPLAY-PROCEDURE.md`
  - `node scripts/runbook-replay-missing-migrations.mjs`
