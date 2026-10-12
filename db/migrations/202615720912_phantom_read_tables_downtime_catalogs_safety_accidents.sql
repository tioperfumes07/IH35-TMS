-- 202615720912_phantom_read_tables_downtime_catalogs_safety_accidents.sql
--
-- 443.99 C lane 2 (CC-3) — verify-sql-read-targets: 7 reads name 3 tables that NO migration creates.
--   catalogs.downtime_categories     <- accounting/company-settlement-report.service.ts, maintenance/kpi.routes.ts
--   catalogs.downtime_fault_parties  <- accounting/company-settlement-report.service.ts, maintenance/kpi.routes.ts
--   safety.accidents                 <- maintenance/driver-damage-scorecard.service.ts, mdata/canonical/driver-hub.service.ts,
--                                       mdata/canonical/driver-overview.service.ts
-- All three exist in production (created out of band; 202613400001 already recorded that safety.accidents "exists on
-- prod but no migration anywhere creates it"), so prod answers these reads — but a fresh database (CI, DR restore, a new
-- branch) has none of them, and every one of those reads errors there.
--
-- This migration restates the PRODUCTION shape exactly, read from prod read-only 2026-10-12 (columns, defaults,
-- constraints, index, RLS + FORCE, policies, triggers, grants, and the three safety.* helper functions safety.accidents
-- depends on). Every statement is IF NOT EXISTS / CREATE OR REPLACE with the prod body / guarded on pg_policies, so on
-- production it changes nothing.

BEGIN;

-- safety.* helpers (bodies verbatim from prod pg_get_functiondef).
CREATE OR REPLACE FUNCTION safety.next_event_display_id(event_prefix text)
 RETURNS text
 LANGUAGE sql
AS $function$
  SELECT upper(coalesce(nullif(trim(event_prefix), ''), 'EVT')) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$function$;

CREATE OR REPLACE FUNCTION safety.touch_event_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION safety.prevent_event_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION '% is a permanent safety record — DELETE is not allowed', TG_TABLE_NAME;
END;
$function$;

-- catalogs.downtime_categories / catalogs.downtime_fault_parties — per-company code lists.
CREATE TABLE IF NOT EXISTS catalogs.downtime_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operating_company_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, code)
);

CREATE TABLE IF NOT EXISTS catalogs.downtime_fault_parties (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operating_company_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, code)
);

ALTER TABLE catalogs.downtime_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.downtime_fault_parties ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'downtime_categories' AND policyname = 'downtime_categories_select') THEN
    CREATE POLICY downtime_categories_select ON catalogs.downtime_categories FOR SELECT
      USING (identity.is_lucia_bypass() OR operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'catalogs' AND tablename = 'downtime_fault_parties' AND policyname = 'downtime_fault_parties_select') THEN
    CREATE POLICY downtime_fault_parties_select ON catalogs.downtime_fault_parties FOR SELECT
      USING (identity.is_lucia_bypass() OR operating_company_id = (NULLIF(current_setting('app.operating_company_id', true), ''))::uuid);
  END IF;
END $$;

-- safety.accidents — a permanent safety record (no DELETE; void columns).
CREATE TABLE IF NOT EXISTS safety.accidents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  display_id text NOT NULL DEFAULT safety.next_event_display_id('ACC'::text),
  event_datetime timestamptz NOT NULL,
  location_text text NOT NULL,
  location_lat numeric,
  location_lng numeric,
  driver_id uuid REFERENCES mdata.drivers(id),
  unit_id uuid REFERENCES mdata.units(id),
  accident_type text NOT NULL CHECK (accident_type = ANY (ARRAY['preventable'::text, 'non-preventable'::text, 'property'::text, 'injury'::text, 'fatality'::text])),
  other_party_info text,
  police_report_number text,
  narrative text,
  injury_count integer NOT NULL DEFAULT 0 CHECK (injury_count >= 0),
  fatality_count integer NOT NULL DEFAULT 0 CHECK (fatality_count >= 0),
  tow_away_required boolean NOT NULL DEFAULT false,
  dot_reportable boolean NOT NULL DEFAULT false,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_safety_accidents_company_event_datetime
  ON safety.accidents USING btree (operating_company_id, event_datetime DESC);

ALTER TABLE safety.accidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.accidents FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'safety' AND tablename = 'accidents' AND policyname = 'safety_accidents_tenant_scope') THEN
    CREATE POLICY safety_accidents_tenant_scope ON safety.accidents TO ih35_app
      USING ((operating_company_id)::text = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia')
      WITH CHECK ((operating_company_id)::text = current_setting('app.operating_company_id', true) OR current_setting('app.bypass_rls', true) = 'lucia');
  END IF;
END $$;

CREATE OR REPLACE TRIGGER trg_safety_accidents_touch_updated_at
  BEFORE UPDATE ON safety.accidents FOR EACH ROW EXECUTE FUNCTION safety.touch_event_updated_at();
CREATE OR REPLACE TRIGGER trg_safety_accidents_block_delete
  BEFORE DELETE ON safety.accidents FOR EACH ROW EXECUTE FUNCTION safety.prevent_event_delete();

-- Grants exactly as prod.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.downtime_categories TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.downtime_fault_parties TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.accidents TO ih35_app;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    EXECUTE 'GRANT SELECT ON catalogs.downtime_categories, catalogs.downtime_fault_parties, safety.accidents TO ih35_ci_readonly';
  END IF;
END $$;

COMMIT;
