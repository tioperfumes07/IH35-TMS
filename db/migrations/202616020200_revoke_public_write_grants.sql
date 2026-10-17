-- 202616020200_revoke_public_write_grants.sql
-- LEAD 443.198 SECURITY — step 2 of 2 (step 1 = 202616020100). Guard: scripts/verify-no-public-write-grants.mjs (#27010).
--
-- MEASURED on prod 2026-10-17 (PG 16.15, read-only): PUBLIC held INSERT on 172, UPDATE on 166, DELETE on 101 relations, and
-- the schema default ACLs of audit / banking / driver_finance (owner neondb_owner) gave PUBLIC "arw" on every new table.
-- Because privileges are a union, PUBLIC silently overrode every deliberate restriction on ih35_app (append-only audit
-- tables with INSERT+SELECT only, read-only views, no-DELETE queues/alerts) and let every role — the guard / CI reader,
-- agent_rw, neon_auth — write application tables.
--
-- ih35_app keeps its effective rights, measured on a fork of prod, not guessed:
--   INSERT / UPDATE: every INSERT/UPDATE ih35_app holds today only through PUBLIC becomes an explicit ih35_app grant (110
--     migrations REVOKE privileges from ih35_app and every one is DELETE or ALL — no migration ever withheld INSERT/UPDATE;
--     live writers depend on the PUBLIC route, e.g. audit.audit_events / audit.row_changes INSERT, abandonment_defaults upsert).
--   DELETE / TRUNCATE: granted to ih35_app ONLY on relations where it holds no grant of its own (prod: accounting.outbox_events,
--     sms.queue, whatsapp.queue, identity.user_notification_preferences, identity.password_reset_tokens). Where ih35_app has
--     its own grant without DELETE, that is the WORM law (REVOKE DELETE … FROM ih35_app) which PUBLIC was defeating; it now
--     holds (prod: email.email_alerts, email.email_queue, maintenance.parts_purchases, maintenance.position_history,
--     qbo.bill_payment_mappings, qbo.reconciliation_alerts, qbo.sync_alerts, qbo.sync_runs, reporting.scheduled_report_runs,
--     reporting.scheduled_reports — apps/backend/src has no DELETE FROM any of them; #27010 moved the two tests off DELETE).
--   Views / materialized views: SELECT only.
--   Default privileges: PUBLIC loses INSERT/UPDATE on future tables in audit / banking / driver_finance; ih35_app gains
--     SELECT/INSERT/UPDATE there, so a new table behaves for the app exactly as today.
-- Idempotent, fresh-DB safe (dynamic over the catalog; no-op where nothing matches). No data touched.

DO $$
DECLARE
  r record;
  has_app boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app');
  app_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'ih35_app');
  n_grant int := 0; n_revoke int := 0; n_default int := 0;
BEGIN
  -- keep ih35_app's effective rights before PUBLIC loses them
  IF has_app THEN
    FOR r IN
      SELECT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS rel, c.relkind,
             EXISTS (SELECT 1 FROM aclexplode(c.relacl) x WHERE x.grantee = app_oid) AS app_has_entry,
             array_agg(DISTINCT a.privilege_type) FILTER (
               WHERE NOT EXISTS (SELECT 1 FROM aclexplode(c.relacl) y WHERE y.grantee = app_oid AND y.privilege_type = a.privilege_type)
             ) AS missing
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN LATERAL aclexplode(c.relacl) a
       WHERE a.grantee = 0
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND n.nspname NOT LIKE 'pg\_%'
         AND EXISTS (SELECT 1 FROM aclexplode(c.relacl) w WHERE w.grantee = 0 AND w.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'))
       GROUP BY c.oid, n.nspname, c.relname, c.relkind
    LOOP
      IF r.relkind IN ('v', 'm') THEN
        IF NOT r.app_has_entry THEN EXECUTE format('GRANT SELECT ON %s TO ih35_app', r.rel); n_grant := n_grant + 1; END IF;
        CONTINUE;
      END IF;
      IF 'SELECT' = ANY (r.missing) AND NOT r.app_has_entry THEN EXECUTE format('GRANT SELECT ON %s TO ih35_app', r.rel); END IF;
      IF 'INSERT' = ANY (r.missing) THEN EXECUTE format('GRANT INSERT ON %s TO ih35_app', r.rel); n_grant := n_grant + 1; END IF;
      IF 'UPDATE' = ANY (r.missing) THEN EXECUTE format('GRANT UPDATE ON %s TO ih35_app', r.rel); n_grant := n_grant + 1; END IF;
      IF NOT r.app_has_entry THEN
        IF 'DELETE' = ANY (r.missing) THEN EXECUTE format('GRANT DELETE ON %s TO ih35_app', r.rel); n_grant := n_grant + 1; END IF;
        IF 'TRUNCATE' = ANY (r.missing) THEN EXECUTE format('GRANT TRUNCATE ON %s TO ih35_app', r.rel); n_grant := n_grant + 1; END IF;
      END IF;
    END LOOP;
  END IF;

  -- revoke every PUBLIC write privilege on application relations
  FOR r IN
    SELECT DISTINCT quote_ident(n.nspname) || '.' || quote_ident(c.relname) AS rel
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) a
     WHERE a.grantee = 0
       AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       AND n.nspname NOT IN ('pg_catalog', 'information_schema')
       AND n.nspname NOT LIKE 'pg\_%'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM PUBLIC', r.rel);
    n_revoke := n_revoke + 1;
  END LOOP;

  -- (c) default privileges that hand PUBLIC writes on future tables
  FOR r IN
    SELECT d.defaclrole::regrole::text AS owner_role, quote_ident(n.nspname) AS nsp, n.nspname AS raw_nsp
      FROM pg_default_acl d
      JOIN pg_namespace n ON n.oid = d.defaclnamespace
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
     WHERE d.defaclobjtype = 'r' AND a.grantee = 0 AND a.privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     GROUP BY d.defaclrole, n.nspname
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA %s REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM PUBLIC', r.owner_role, r.nsp);
    IF has_app THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %s IN SCHEMA %s GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app', r.owner_role, r.nsp);
    END IF;
    n_default := n_default + 1;
  END LOOP;

  RAISE NOTICE '202616020200: % explicit ih35_app grant(s), % relation(s) lost PUBLIC writes, % default ACL(s) fixed', n_grant, n_revoke, n_default;
END $$;
