# Migration Drift Recovery Runbook

Operational runbook for recovering from migration drift, including historical replay patterns from [PR #175](https://github.com/tioperfumes07/IH35-TMS/pull/175) and DS-REMEDIATE-PROCESS-1 ([PR #173](https://github.com/tioperfumes07/IH35-TMS/pull/173)).

## 1) Drift detection signals

Treat the following as drift signals that require investigation:

- Disk migration files do not match ledger rows in `_system._schema_migrations`.
- `ih35_migrations.applied_migrations` diverges from canonical `_system._schema_migrations`.
- Migration exists on disk but appears unledgered in one or both ledgers.
- Ledger rows exist for files no longer present on disk (rename/orphan drift).

Run:

- `node scripts/runbook-detect-migration-drift.mjs`
- `node scripts/runbook-detect-migration-drift.mjs --strict` (fail-fast mode)

Known local-only orphan artifacts can occur in developer DBs (for example stale `0360/0378/0379/0380` rows from the `--no-verify` orphan condition). Treat those as local cleanup items, not CI migration-chain failures.

## 2) SAFE_REPLAY historical replay procedure

When schema objects are present but ledger state is incomplete or inconsistent:

1. Freeze deployment for the affected lane/environment.
2. Validate backups/PITR restore point exists.
3. Generate replay guidance with:
   - `node scripts/runbook-replay-missing-migrations.mjs`
4. Build SAFE_REPLAY SQL using `docs/runbooks/SAFE-REPLAY-PROCEDURE.md`.
5. Run replay in a controlled environment using a single transaction.
6. Re-run drift detection and consistency checks.

Never run privileged orphan-row deletes as part of this replay flow without explicit owner sign-off.

## 3) Dual-ledger insert pattern

Replay/repair entries must maintain parity in both ledgers:

- Canonical ledger: `_system._schema_migrations`
- Mirror ledger: `ih35_migrations.applied_migrations`

Pattern (inside the replay transaction):

```sql
INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('<migration_file>', '<sha256_checksum>', now(), '<operator_id>', 0)
ON CONFLICT (filename) DO NOTHING;

INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('<migration_file>', now(), '<operator_id>')
ON CONFLICT (name) DO NOTHING;
```

## 4) Post-replay verification

After replay completes:

1. Run `npm run verify:migration-application-consistency`.
2. Run `node scripts/runbook-detect-migration-drift.mjs --strict`.
3. Run static chain guards:
   - `npm run verify:ledger-parity-static`
   - `npm run verify:no-unledgered-migrations`
   - `node scripts/runbook-verify-migration-chain.mjs`
4. If orphans remain, follow `docs/runbooks/migration-orphan-cleanup.md` using privileged Neon SQL Editor workflow (separate approved operation).
