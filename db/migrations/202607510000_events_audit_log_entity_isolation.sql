-- [HOLD-FOR-JORGE — TIER 1] Entity isolation for events.event_log and public.audit_log.
--
-- events.event_log: already has operating_company_id and RLS enabled, but the policies use the old
-- app.current_operating_company_id GUC and are not FORCED. This migration forces RLS and replaces the
-- policies with the canonical app.operating_company_id GUC + identity.is_lucia_bypass() escape hatch.
--
-- public.audit_log: has no operating_company_id and no RLS. This migration adds the column, attempts a
-- best-effort backfill from the record FK for known entity-scoped tables, then enables+forces RLS with a
-- WORM (write-once-read-many) policy: SELECT/INSERT only, no UPDATE/DELETE for ih35_app. Un-backfilled
-- rows remain NULL and are visible only under identity.is_lucia_bypass() until the owner classifies them.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP/CREATE POLICY, ENABLE/FORCE are no-ops when already set.
-- Apply-twice safe. Fresh-DB-from-0001 safe.

BEGIN;

-- ============================================================================
-- events.event_log: force RLS + canonical GUC policy
-- ============================================================================
ALTER TABLE events.event_log ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_log_tenant_insert ON events.event_log;
DROP POLICY IF EXISTS event_log_tenant_isolation ON events.event_log;
DROP POLICY IF EXISTS event_log_opco_insert ON events.event_log;
DROP POLICY IF EXISTS event_log_opco_select ON events.event_log;

CREATE POLICY event_log_opco_insert ON events.event_log
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

CREATE POLICY event_log_opco_select ON events.event_log
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

-- ============================================================================
-- public.audit_log: add opco, backfill, enable+force RLS, WORM policy
-- ============================================================================
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS operating_company_id uuid;

-- Add the column to every existing partition so it inherits the parent; partitions created later inherit
-- automatically. This is a no-op if already present.
DO $partitions$
DECLARE
  part text;
BEGIN
  FOR part IN
    SELECT inh.relname
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class inh ON pg_inherits.inhrelid = inh.oid
    JOIN pg_namespace n ON n.oid = parent.relnamespace
    WHERE parent.relname = 'audit_log' AND n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS operating_company_id uuid', part);
  END LOOP;
END
$partitions$;

-- Best-effort backfill for known entity-scoped tables referenced by audit_log.table_name/record_id.
-- Each UPDATE is independent so a missing/split table does not abort the rest. NULL rows are left for the
-- owner to classify.
DO $backfill$
DECLARE
  mapping record;
  rows_updated bigint;
  total_backfilled bigint := 0;
BEGIN
  -- (referenced_table, opco_column, id_column)
  FOR mapping IN VALUES
    ('accounting.journal_entries',       'operating_company_id', 'id'),
    ('accounting.journal_entry_postings',  'operating_company_id', 'id'),
    ('accounting.payments',                'operating_company_id', 'id'),
    ('accounting.invoices',                'operating_company_id', 'id'),
    ('accounting.bills',                   'operating_company_id', 'id'),
    ('accounting.expenses',                'operating_company_id', 'id'),
    ('mdata.customers',                    'operating_company_id', 'id'),
    ('mdata.drivers',                      'operating_company_id', 'id'),
    ('mdata.units',                        'operating_company_id', 'id'),
    ('mdata.loads',                        'operating_company_id', 'id'),
    ('driver_finance.settlements',         'operating_company_id', 'id'),
    ('driver_finance.driver_advances',     'operating_company_id', 'id'),
    ('banking.bank_accounts',              'operating_company_id', 'id'),
    ('maintenance.work_orders',            'operating_company_id', 'id')
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE public.audit_log l
            SET operating_company_id = r.%I::uuid
           FROM %I r
          WHERE l.operating_company_id IS NULL
            AND l.table_name = $1
            AND l.record_id::text = r.%I::text',
        mapping.column2, mapping.column1, mapping.column3
      ) USING mapping.column1;
      GET DIAGNOSTICS rows_updated = ROW_COUNT;
      total_backfilled := total_backfilled + rows_updated;
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'audit_log backfill: referenced table % does not exist; skipping', mapping.column1;
    END;
  END LOOP;

  RAISE NOTICE 'audit_log_entity_isolation: backfilled % rows from referenced record tables', total_backfilled;
END
$backfill$;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY, FORCE ROW LEVEL SECURITY;

-- WORM policy: SELECT and INSERT only. No UPDATE/DELETE policies means ih35_app cannot mutate rows.
DROP POLICY IF EXISTS audit_log_select_scope ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert_scope ON public.audit_log;
DROP POLICY IF EXISTS audit_events_select ON public.audit_log;
DROP POLICY IF EXISTS audit_events_insert ON public.audit_log;

CREATE POLICY audit_log_select_scope ON public.audit_log
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

CREATE POLICY audit_log_insert_scope ON public.audit_log
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

COMMIT;

-- Owner post-apply classification query:
-- SELECT table_name, count(*) FROM public.audit_log WHERE operating_company_id IS NULL GROUP BY table_name;
