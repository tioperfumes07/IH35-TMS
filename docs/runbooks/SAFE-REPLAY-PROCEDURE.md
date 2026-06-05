# SAFE_REPLAY Procedure

Annotated template for replaying missing migrations safely, modeled after the historical replay used in [PR #175](https://github.com/tioperfumes07/IH35-TMS/pull/175) and DS-REMEDIATE-PROCESS-1 ([PR #173](https://github.com/tioperfumes07/IH35-TMS/pull/173)).

## Preconditions

- Owner approval and active change window.
- Verified backup / PITR restore point.
- Drift snapshot captured (`node scripts/runbook-detect-migration-drift.mjs`).
- Privileged cleanup (if needed) is planned separately per `docs/runbooks/migration-orphan-cleanup.md`.

## Operator flow

1. Generate candidate replay list:
   - `node scripts/runbook-replay-missing-migrations.mjs`
2. For each missing migration:
   - Copy the original SQL body from `db/migrations/<file>.sql`.
   - Preserve statement ordering.
   - Remove nested `BEGIN/COMMIT` wrappers if composing a single transaction replay file.
3. Insert dual-ledger rows for each replayed migration.
4. Execute in one transaction where feasible.
5. Verify consistency and drift status after execution.

## SAFE_REPLAY template

```sql
-- SAFE_REPLAY_<YYYYMMDD>.sql
-- Environment: <env>
-- Incident: <ticket_or_block>
-- Operator: <name_or_id>

BEGIN;

-- >>> <NNNN_description.sql>
-- checksum(sha256): <sha256_of_original_file>
-- Paste original migration body below (transaction wrappers removed if present).
<original_migration_sql_body>;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES ('<NNNN_description.sql>', '<sha256_of_original_file>', now(), '<operator_id>', 0)
ON CONFLICT (filename) DO NOTHING;

INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES ('<NNNN_description.sql>', now(), '<operator_id>')
ON CONFLICT (name) DO NOTHING;

-- Repeat block per migration in deterministic order.

COMMIT;
```

## Post-execution checks

- `npm run verify:migration-application-consistency`
- `node scripts/runbook-detect-migration-drift.mjs --strict`
- `node scripts/runbook-verify-migration-chain.mjs`

If drift remains, stop and escalate before additional replay attempts.
