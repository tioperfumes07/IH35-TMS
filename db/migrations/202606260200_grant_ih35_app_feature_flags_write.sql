-- [HOLD-FOR-JORGE] grant ih35_app write access on lib.feature_flags + lib.feature_flag_overrides
--
-- ROOT CAUSE (live): the admin Feature-Flags "Add flag" POST /api/feature-flags returns 500 with
-- Postgres 42501 "permission denied for table feature_flags". The feature-flags migrations granted
-- ih35_app SELECT ONLY on lib.feature_flags + lib.feature_flag_overrides (202606071200 + a later grant),
-- but apps/backend/src/lib/feature-flags/service.ts writes:
--   - INSERT INTO lib.feature_flags          (create flag)
--   - UPDATE      lib.feature_flags          (toggle / edit flag)
--   - INSERT INTO lib.feature_flag_overrides (per-tenant/user override; upsert)
--   - UPDATE      lib.feature_flag_overrides (upsert ON CONFLICT)
--   - DELETE FROM lib.feature_flag_overrides (remove override)
-- Missing write grants block creating/toggling ANY flag via the admin UI (incl. LEGAL_CONTRACTS_ENABLED).
--
-- Both tables use non-sequence PKs (feature_flags.flag_key TEXT; feature_flag_overrides.uuid DEFAULT
-- gen_random_uuid()) — NO sequence grant needed. DELETE on feature_flags is granted defensively in case
-- the UI later removes flags (harmless if unused). Idempotent + role-guarded + self-contained
-- (Standing Order #16); replays clean on fresh DB from 0001 (lib.feature_flags created in 202606071200,
-- which precedes this). This is a GRANT-only change — no DDL, no data.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT INSERT, UPDATE, DELETE ON lib.feature_flags          TO ih35_app;
    GRANT INSERT, UPDATE, DELETE ON lib.feature_flag_overrides TO ih35_app;
  END IF;
END $$;
