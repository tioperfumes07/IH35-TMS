-- *** HOLD-FOR-JORGE — DO NOT RUN ON PROD. STOP-GATE. Verify writer first. ***
-- [HOLD-FOR-JORGE — TIER 1] P0 DB-audit — public.audit_log (+ 48 monthly partitions) grant lockdown
--
-- See docs/db-audit/P0-audit-log-rls-DESIGN.md for the full verification trail.
--
-- ============================================================================================
-- FINDING (verified live against apps/backend/src + db/migrations, 2026-07-05 — design/p0-audit-log-rls):
--   `public.audit_log` (created 202606080940 "Block 26 partition hot tables") is a LEGACY, NO-LONGER-
--   WRITTEN table. It was partitioned into `public.audit_log_partitioned` with 48 monthly range partitions
--   `audit_log_2024_01` .. `audit_log_2027_12` (verified: exactly 48 = 4 years x 12 months). Both the base
--   table and the partitioned table were granted `SELECT, INSERT ... TO ih35_app`, with NO
--   `operating_company_id` column and NO row level security at all — the original migration's own comment
--   reads "No operating_company_id: this is a cross-tenant audit log; RLS not needed."
--
--   Grepped repo-wide for every backend write/read of this table: the ONLY two SQL statements that ever
--   touch it are inside migrations themselves (202606080935 mechanic-shop backfill, guarded by a
--   `to_regclass` check, and 202606080940's own one-time COPY from audit_log into audit_log_partitioned).
--   ZERO current apps/backend/src/*.ts files reference bare `audit_log` / `public.audit_log`. Every live
--   audit code path uses the CANONICAL sink instead — `audit.audit_events` (comments in
--   apps/backend/src/owner/todays-attention/routes.ts:174 and apps/backend/src/reports/ifta/
--   quarterly-preparer.service.ts:206,248 both say verbatim "audit.audit_log never existed" — a naming red
--   herring; the real dead table is `public.audit_log`, a different schema entirely). This confirms
--   `public.audit_log` is a LEGACY / dead table, NOT actively written by any current runtime code path.
--
--   Given it is dead (no live writer) and has no tenant-scoping column to hang RLS policies off without a
--   schema change + backfill, bolting on full RLS machinery here would be over-engineering a table nobody
--   writes to anymore, and touching a "hot table" partition set for no operational benefit. The correct,
--   minimal, auditable fix — consistent with least-privilege — is a GRANT lockdown:
--     - REVOKE the now-unnecessary INSERT (and UPDATE/DELETE, though never granted, for belt-and-suspenders)
--       from ih35_app on the base table, the partitioned parent, and every existing monthly partition.
--     - REVOKE ALL FROM PUBLIC on the same set (defense-in-depth; no evidence PUBLIC currently holds any
--       grant here, but nothing before this migration ever asserted the negative — do so explicitly and
--       idempotently).
--     - LEAVE SELECT in place for ih35_app (append-only historical/forensic read access preserved; nothing
--       reads it today, but revoking SELECT too would be a needless additional restriction on a 7-year IRS
--       financial-record retention table (see 202606080940's own header) with no upside).
--   This is NOT a data change and NOT a schema change — REVOKE only. Idempotent: REVOKE on a privilege
--   already absent is a no-op, no error, in Postgres. Programmatic over the partition set (drift-proof —
--   does not hardcode all 48 names) so it correctly covers whatever partitions exist when this actually
--   runs.
--
--   NOTE: this migration touches GRANTs on tables read by `information_schema.role_table_grants` and will
--   correctly trip the repo's hold-merge-gate to PROTECTED (per the financial-migrations guardrail) — that
--   is the intended, correct behavior for a HOLD migration; it must not be softened.

DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    RAISE NOTICE '[P0-AUDIT-LOG-LOCKDOWN] role ih35_app does not exist on this database — nothing to revoke, no-op.';
    RETURN;
  END IF;

  -- Base table + partitioned parent (explicit, in case one or the other does not exist on this DB).
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM ih35_app';
    EXECUTE 'REVOKE ALL ON public.audit_log FROM PUBLIC';
  END IF;

  IF to_regclass('public.audit_log_partitioned') IS NOT NULL THEN
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.audit_log_partitioned FROM ih35_app';
    EXECUTE 'REVOKE ALL ON public.audit_log_partitioned FROM PUBLIC';
  END IF;

  -- Every monthly partition that currently exists (audit_log_YYYY_MM) — programmatic, not hardcoded, so
  -- this stays correct even if the partition set grows/shrinks before this migration is actually applied.
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname ~ '^audit_log_[0-9]{4}_[0-9]{2}$'
  LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM ih35_app', r.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', r.relname);
  END LOOP;

  RAISE NOTICE '[P0-AUDIT-LOG-LOCKDOWN] revoked INSERT/UPDATE/DELETE from ih35_app and ALL from PUBLIC on public.audit_log + audit_log_partitioned + all matching monthly partitions. SELECT preserved for ih35_app.';
END $$;
