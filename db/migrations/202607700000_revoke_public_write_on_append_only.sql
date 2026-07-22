-- [TIER 1 · GRANTS] Restore append-only enforcement: REVOKE PUBLIC write privileges on the audit trail
-- and the two GL-run idempotency anchors. APPLIED ON PROD 2026-07-21 by the owner's instruction; this file
-- is the repo record so a fresh CI DB and prod converge.
--
-- ROOT CAUSE (verified on prod br-fancy-credit-akjnd07a, 2026-07-21):
--   147 of 695 tables carry a PUBLIC grant; 137 give PUBLIC DELETE. `information_schema.role_table_grants`
--   does NOT surface them — it reported ih35_app as SELECT/INSERT/UPDATE-only on payrun_gl_runs while
--   has_table_privilege(...,'DELETE') returned TRUE. The truth is pg_class.relacl, where an entry with an
--   EMPTY grantee ("=arwd/neondb_owner") means PUBLIC. Every role inherits it, including the LOGIN role
--   `agent_rw`. VERIFY GRANTS WITH relacl, NEVER WITH information_schema.
--
--   audit.audit_events  was: neondb_owner=arwdDxt | =arw  | ih35_app=r
--   audit.row_changes   was: =arw | neondb_owner=arwdDxt  | ih35_app=r
--     ih35_app is correctly capped at SELECT, but PUBLIC held INSERT+UPDATE — so constitution §2
--     ("never UPDATE/DELETE audit_events / audit.row_changes") was NOT enforced. Any role could rewrite
--     the audit trail.
--   driver_finance.payrun_gl_runs was: =arwd | ... | ih35_app=arw
--   driver_finance.driver_settlement_gl_runs was: =arwd | ... | ih35_app=arw
--     202607380000 / 202607060900 granted ih35_app only SELECT/INSERT/UPDATE and documented "no DELETE —
--     append-only", but PUBLIC's `d` handed DELETE back. A deletable idempotency anchor cannot prevent a
--     double-posted JE, which is the sole reason those tables exist.
--
-- WHAT IS DELIBERATELY *NOT* REVOKED:
--   PUBLIC INSERT + SELECT on the audit tables STAY. ih35_app holds only SELECT explicitly, so audit writes
--   reach the table THROUGH PUBLIC's INSERT — revoking it would silently stop audit capture, the opposite
--   of the goal. Append-only = INSERT allowed, UPDATE/DELETE denied. That is exactly what this does.
--
-- WHY THIS IS NARROW (scoping, not deferral):
--   A blanket "REVOKE ALL ON ALL TABLES FROM PUBLIC" BREAKS PRODUCTION. Verified: 7 tables have NO explicit
--   ih35_app ACL and depend entirely on PUBLIC —
--     _system._schema_migrations, ih35_migrations.applied_migrations, accounting.outbox_events,
--     identity.password_reset_tokens, identity.user_notification_preferences, sms.queue, whatsapp.queue
--   (11 tables would lose INSERT). Those need explicit ih35_app grants BEFORE PUBLIC is revoked. That sweep
--   is tracked as GRANT-PUBLIC-SWEEP in docs/trackers/DEFERRED-ITEMS.md with the full 147-table inventory.
--   This migration covers only the surfaces where the revoke is provably zero-risk: nothing legitimately
--   UPDATEs an audit row or DELETEs a GL-run anchor.
--
-- Idempotent: REVOKE is a no-op when the privilege is already absent. Grants only shrink for PUBLIC,
-- never for ih35_app. All four tables are created by earlier migrations, so plain (unguarded) REVOKE is
-- safe on a fresh CI DB built from 0001.

BEGIN;

-- audit trail -> append-only (INSERT + SELECT retained for PUBLIC; UPDATE/DELETE/TRUNCATE denied)
REVOKE UPDATE, DELETE, TRUNCATE ON audit.audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit.row_changes  FROM PUBLIC;

-- GL-run idempotency anchors -> no DELETE (UPDATE retained: the poster stamps journal_entry_id/status)
REVOKE DELETE, TRUNCATE ON driver_finance.payrun_gl_runs            FROM PUBLIC;
REVOKE DELETE, TRUNCATE ON driver_finance.driver_settlement_gl_runs FROM PUBLIC;

COMMIT;

-- POST-STATE ON PROD (verified 2026-07-21 after apply):
--   audit.audit_events                      =ar   | neondb_owner=arwdDxt | ih35_app=r
--   audit.row_changes                       =ar   | neondb_owner=arwdDxt | ih35_app=r
--   driver_finance.payrun_gl_runs           =arw  | neondb_owner=arwdDxt | ih35_app=arw
--   driver_finance.driver_settlement_gl_runs=arw  | neondb_owner=arwdDxt | ih35_app=arw
--   has_table_privilege('ih35_app'|'agent_rw', <tbl>, 'DELETE') = false on all four.
--
-- VERIFY (read-only):
--   SELECT n.nspname||'.'||c.relname, array_to_string(c.relacl,' | ')
--   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE (n.nspname='audit' AND c.relname IN ('audit_events','row_changes'))
--      OR (n.nspname='driver_finance' AND c.relname IN ('payrun_gl_runs','driver_settlement_gl_runs'));
