-- Rollback for CLOSURE-32 0360 ledger reconciliation (2026-06-05)
--
-- Purpose: restore the orphan ledger rows for '0360_safety_onboarding_sessions.sql'
-- if the authorized single-transaction reconciliation needs to be reverted.
--
-- Context: '0360_safety_onboarding_sessions.sql' was a pre-rename artifact; the
-- canonical migration ships on disk as '0361_safety_onboarding_sessions.sql'
-- (already ledgered). The 0360 rows are orphans (no file on disk) per
-- docs/runbooks/migration-orphan-cleanup.md and were removed under a one-time
-- authorized lift of the "no DELETE SQL on ledgers" constraint.
--
-- Captured read-only from prod (Neon project tiny-field-89581227, default branch)
-- immediately before the DELETE. Values are exact.
--
-- To restore, run this entire file as a single transaction in the Neon SQL Editor
-- (privileged neondb_owner role).

BEGIN;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES (
  '0360_safety_onboarding_sessions.sql',
  '8ec738d1188093c5fcb4b649c432baaace4482faa981fb4db9589eed96d7d80c',
  '2026-06-04 10:18:25.895074+00',
  'neondb_owner',
  153
)
ON CONFLICT (filename) DO NOTHING;

INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES (
  '0360_safety_onboarding_sessions.sql',
  '2026-06-04 10:18:25.965595+00',
  NULL
)
ON CONFLICT (name) DO NOTHING;

COMMIT;
