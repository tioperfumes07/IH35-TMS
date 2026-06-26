-- [HOLD-FOR-JORGE — TIER 1] BLOCK-SPINE-00: grant ih35_app SELECT on events.event_log
--
-- WHY: PR #1491 (migration 202606251300) repaired the WRITE path for the event spine — it granted
-- ih35_app USAGE on schema `events`, granted EXECUTE on events.log_event, and made log_event a
-- SECURITY DEFINER function owned by neondb_owner (so the INSERT into event_log runs as the owner,
-- which bypasses the table's RLS because event_log is RLS-ENABLED-but-NOT-FORCED). The write path is
-- now sound. BUT the READ path is still broken:
--     has_table_privilege('ih35_app','events.event_log','SELECT') = FALSE on prod (GUARD live-verified).
-- SECURITY DEFINER covers the function's own write; it does NOT cover direct reads. Two endpoints
-- SELECT directly FROM events.event_log AS ih35_app:
--     apps/backend/src/audit/audit-reports.routes.ts
--     apps/backend/src/audit/spine-events.routes.ts
-- Both 500 ("permission denied for table event_log") the moment they are opened — invisible until
-- someone loads the audit-report screen. This violates the §15 grant convention (USAGE + SELECT/...).
--
-- SCOPE: schema `events` has EXACTLY ONE base table (event_log) — verified against db/migrations.
-- So this single SELECT grant is the entire functional change. It is the minimal, auditable fix.
--   - Do NOT grant INSERT: writes go through the SECURITY DEFINER log_event function; the app role must
--     never write event_log directly (preserves the append-only + immutability invariants).
--   - Do NOT touch RLS / FORCE ROW LEVEL SECURITY.
--   - Idempotent (GRANT is a no-op if already present), role-guarded, self-contained; event_log is
--     created in 202606111050_w1a_event_log_spine.sql, so this replays clean on a fresh DB from 0001.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT ON events.event_log TO ih35_app;
  END IF;
END $$;
