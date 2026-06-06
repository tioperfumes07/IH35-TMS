-- Rollback for CLOSURE-32 orphan reconciliation of {0378,0379,0380} (2026-06-05)
--
-- Purpose: restore the orphan ledger rows for the three pre-rename migration
-- artifacts if the authorized single-transaction reconciliation needs reverting.
--
-- Context (renumber-orphan pattern; same class as 0360 -> 0361):
--   0378_qbo_sync_drift_log.sql   -> canonical on disk: 0379_qbo_sync_drift_log.sql
--   0379_drug_alcohol_program.sql -> canonical on disk: 0380_drug_alcohol_program.sql
--   0380_csa_basic_scores.sql     -> canonical on disk: 0381_csa_basic_scores.sql
-- Each canonical renamed file is present on disk WITH its own ledger entries (1/1),
-- and the target prod tables exist (qbo_sync.drift_log, compliance.drug_alcohol_*,
-- compliance.csa_basic_scores). The orphan rows below have no file on disk.
--
-- Captured read-only from prod (Neon project tiny-field-89581227, default branch)
-- immediately before the DELETE. Values are exact.
--
-- To restore, run this entire file as a single transaction in the Neon SQL Editor
-- (privileged neondb_owner role).

BEGIN;

INSERT INTO _system._schema_migrations (filename, checksum, applied_at, applied_by, duration_ms)
VALUES
  ('0378_qbo_sync_drift_log.sql',   '9c2ca25dfcc3a20387ebaaae247a84e95110cc89687be937f37629a3bec7ab4f', '2026-06-05 02:25:40.72905+00',  'neondb_owner', 24),
  ('0379_drug_alcohol_program.sql', 'f40f6bf99de2a4522b2f3e9aaf8c34d98286f96ce1d96a378cccf9163d797079', '2026-06-05 02:27:49.24101+00',  'neondb_owner', 169),
  ('0380_csa_basic_scores.sql',     '6a97b3b451777f79f91bc62d2adaff6d25030630f03028e78e7dde043e8253d0', '2026-06-05 02:38:09.683442+00', 'neondb_owner', 209)
ON CONFLICT (filename) DO NOTHING;

INSERT INTO ih35_migrations.applied_migrations (name, applied_at, applied_by)
VALUES
  ('0378_qbo_sync_drift_log.sql',   '2026-06-05 02:25:40.732173+00', NULL),
  ('0379_drug_alcohol_program.sql', '2026-06-05 02:27:49.312353+00', NULL),
  ('0380_csa_basic_scores.sql',     '2026-06-05 02:38:09.780954+00', NULL)
ON CONFLICT (name) DO NOTHING;

COMMIT;
