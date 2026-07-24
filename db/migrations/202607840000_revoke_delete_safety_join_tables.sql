-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- Apply AFTER 202607820000 / 202607830000 (held_apply_order) — it hardens tables 820000 creates.
--
-- SAF-F29-GRANTS — REVOKE DELETE on the three company-violation join tables.
--
-- ROOT CAUSE (found by the owner during prod verification of #3380, and it is a real lesson):
-- 202607820000 issued `GRANT SELECT, INSERT, UPDATE` and I described that as "no DELETE grant".
-- It is not. GRANT is ADDITIVE — it adds privileges, it does not remove any. The `safety` schema
-- carries a DEFAULT PRIVILEGE of `ih35_app=arwd/neondb_owner`, where the `d` is DELETE, so every
-- new table created in `safety` INHERITS DELETE at creation. The GRANT then sat on top of an
-- inherited DELETE and the three tables shipped DELETE-able.
--
-- Why local validation missed it: I applied the migration to a throwaway local database whose
-- schema default privileges do not include that `arwd` grant, so the resulting ACL was
-- INSERT,SELECT,UPDATE there and DELETE,INSERT,SELECT,UPDATE on prod. Same SQL, different ACL.
-- PROD WINS (§0) — a local apply proves the DDL parses and is idempotent; it does NOT prove the
-- resulting privileges.
--
-- PRECEDENT that confirms the intended posture: safety.civil_fines shows INSERT,SELECT,UPDATE on
-- prod — DELETE was explicitly REVOKEd there. These evidence tables must match it.
--
-- The owner has already run a bare REVOKE on prod to close it immediately (verified: all three now
-- INSERT,SELECT,UPDATE). This migration makes that permanent and CI-consistent, so a fresh database
-- built from migrations lands in the same state as prod instead of silently re-inheriting DELETE.
--
-- IDEMPOTENT: REVOKE of an already-revoked privilege is a no-op on prod and on a fresh CI DB.

BEGIN;

REVOKE DELETE ON
  safety.company_violation_drivers,
  safety.company_violation_units,
  safety.company_violation_fines
FROM ih35_app;

COMMIT;

-- ===========================================================================================
-- POST-APPLY VERIFY (by hand on the Neon branch; NOT part of the migration)
-- ===========================================================================================
--   SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS grants
--     FROM information_schema.role_table_grants
--    WHERE table_schema='safety' AND grantee='ih35_app'
--      AND table_name LIKE 'company_violation_%'
--    GROUP BY table_name ORDER BY table_name;
--   -- expect INSERT,SELECT,UPDATE for all three — and NO DELETE.
--
-- DOWN (manual rollback — only if a hard-delete path is ever legitimately introduced):
--   GRANT DELETE ON safety.company_violation_drivers, safety.company_violation_units,
--                   safety.company_violation_fines TO ih35_app;
