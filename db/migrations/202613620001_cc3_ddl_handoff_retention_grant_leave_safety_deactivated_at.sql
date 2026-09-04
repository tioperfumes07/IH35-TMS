-- 202613620001_cc3_ddl_handoff_retention_grant_leave_safety_deactivated_at.sql
-- CC-3 DDL HANDOFF (owner 2026-09-03/09-04): CC-3 was routed two DDL items he has no grant for.
-- Small, closes his merge cleanly.
--
-- 1) drivers.retention_scores: ih35_app (the runtime role) has only SELECT/INSERT (confirmed live
--    via information_schema.role_table_grants) -- no UPDATE, no DELETE. CC-3's work needs to
--    update this table and cannot. GRANT the same standard set migration 0065 grants everywhere
--    else (SELECT/INSERT/UPDATE/DELETE); DELETE is granted for parity with every other table's
--    default-privilege shape even though app code should never actually delete a row (void, never
--    delete is standing law -- this grant does not create a deletion, it just matches convention).
--
-- 2) VOID-COLUMN CONVENTION (owner-locked 2026-09-03): deactivated_at = "still real, no longer
--    selectable" -- the correct convention for master/reference-style rows like a leave-balance
--    period or a computed safety-score snapshot (nothing here reverses money, so voided_at would be
--    the wrong word; nothing here is an access grant, so revoked_at would be the wrong word).
--    catalogs.driver_leave_balances and safety.driver_safety_scores each get a nullable
--    deactivated_at so CC-3 can void two duplicate rows without deleting them (nothing is ever
--    permanently deleted -- standing law).

ALTER TABLE catalogs.driver_leave_balances
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deactivated_reason text NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by_user_id uuid NULL REFERENCES identity.users(id);

ALTER TABLE safety.driver_safety_scores
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deactivated_reason text NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by_user_id uuid NULL REFERENCES identity.users(id);

-- One predicate per surface (VOID-COLUMN CONVENTION law): every reader of these two tables that
-- lists "active" rows must filter deactivated_at IS NULL, consistently -- CC-3's own writer/reader
-- work wires that filter; this migration only adds the column both sides will share.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE drivers.retention_scores TO ih35_app;

COMMENT ON COLUMN catalogs.driver_leave_balances.deactivated_at IS
  'VOID-COLUMN CONVENTION (owner-locked 2026-09-03): "still real, no longer selectable" --
   never write test/sample rows to backfill this; nothing here reverses money.';
COMMENT ON COLUMN safety.driver_safety_scores.deactivated_at IS
  'VOID-COLUMN CONVENTION (owner-locked 2026-09-03): "still real, no longer selectable" --
   never write test/sample rows to backfill this; nothing here reverses money.';
