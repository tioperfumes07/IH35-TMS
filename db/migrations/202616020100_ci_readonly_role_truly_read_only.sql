-- 202616020100_ci_readonly_role_truly_read_only.sql
-- LEAD 443.197 SECURITY — step 1 of 2 (CC-3 finding 2026-10-17 ~18:00Z; Lead measured on prod read-only, PG 16.15).
-- The "read-only" guard credentials can write:
--   ih35_ci_readonly  — member of neon_superuser (→ pg_write_all_data) and ih35_app (INHERIT, SET);
--   ih35_guard_reader — pg_read_all_data only, BUT PUBLIC itself holds INSERT/UPDATE/DELETE on 439 table
--                       privileges (schema default privileges grant PUBLIC arw/arwd), so every role can write.
-- CI's required-live-load-guard and every seat's neon-prod-readonly.url connect as ih35_ci_readonly; an agent's
-- default dry run (BEGIN … ROLLBACK) executed writes through it (rolled back; nothing persisted).
-- STEP 1 (this migration, no data touched, idempotent, fresh-DB safe): both guard roles start EVERY session
-- read-only. A guard / dry run that does not explicitly ask for a read-write transaction can no longer write.
-- ih35_app membership is kept for ih35_ci_readonly: two CI live guards SET LOCAL ROLE ih35_app to test RLS as the
-- application (verify-usmca-app-path-list-apis, verify-workflow-requests-entity-scoped); the session stays read-only.
-- STEP 2 (ROUND 443.198, separate PR): remove PUBLIC's write grants + the schema default privileges that create them,
-- after granting ih35_app explicitly every privilege the application actually writes with (audit.audit_events INSERT,
-- outbox, queues, password reset …) — WORM tables keep their revoked DELETE.

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['ih35_ci_readonly', 'ih35_guard_reader'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('ALTER ROLE %I SET default_transaction_read_only = on', r);
      RAISE NOTICE '202616020100: % now starts every session read-only', r;
    END IF;
  END LOOP;
END $$;
