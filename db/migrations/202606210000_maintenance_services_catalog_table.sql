-- Maintenance services catalog table (services-catalog 500 fix).
--
-- CLOSURE-11 shipped the routes (apps/backend/src/catalogs/maintenance/services.routes.ts) — GET/POST/PATCH
-- on /api/v1/catalogs/maintenance/services-catalog + GET /maintenance/services/eta — but the table they query,
-- mdata.maintenance_services, was never created. GET therefore 500s live with 42P01
-- "relation mdata.maintenance_services does not exist". This is the single missing table; sibling catalogs
-- (equipment-types, labor-rates) work. Pure ADDITIVE new table — the table does not exist, so there is zero
-- existing data to touch. No ALTER, no DML on existing tables, no financial table.
--
-- Columns are exactly those the handler + createSchema require (no invention):
--   listQuerySchema/handler reads: operating_company_id, service_code, service_name, service_category,
--     applies_to_type; orders by service_category, service_name.
--   createSchema writes: service_code, service_name, service_category, applies_to_type, interval_miles,
--     interval_months, interval_hours, is_safety_critical, typical_duration_hours, typical_cost_cents,
--     compliance_ref, is_active.
--   eta handler reads: id, service_code, service_name, interval_miles, interval_months, interval_hours,
--     applies_to_type, is_safety_critical.
--
-- Conventions (CLAUDE.md): server-generated PK, operating_company_id RLS scoping, per-entity policy
-- FOR ALL TO ih35_app, explicit GRANTs (a new table is NOT covered by the one-time GRANT ON ALL TABLES),
-- is_active soft-delete. Reversible: DROP TABLE mdata.maintenance_services;
BEGIN;

CREATE TABLE IF NOT EXISTS mdata.maintenance_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  service_code text NOT NULL,
  service_name text NOT NULL,
  service_category text NOT NULL,
  applies_to_type text NOT NULL DEFAULT 'all' CHECK (applies_to_type IN ('truck', 'trailer', 'reefer', 'all')),
  interval_miles integer CHECK (interval_miles IS NULL OR interval_miles > 0),
  interval_months integer CHECK (interval_months IS NULL OR interval_months > 0),
  interval_hours integer CHECK (interval_hours IS NULL OR interval_hours > 0),
  is_safety_critical boolean NOT NULL DEFAULT false,
  typical_duration_hours numeric(6, 2) CHECK (typical_duration_hours IS NULL OR typical_duration_hours >= 0),
  typical_cost_cents integer NOT NULL DEFAULT 0 CHECK (typical_cost_cents >= 0),
  compliance_ref text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, service_code)
);

-- Read pattern: list per company ordered by category, name (the GET handler's ORDER BY).
CREATE INDEX IF NOT EXISTS idx_maintenance_services_company_cat
  ON mdata.maintenance_services (operating_company_id, service_category, service_name);

-- RLS: per-entity, identical shape to the other mdata catalogs.
ALTER TABLE mdata.maintenance_services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maintenance_services_company ON mdata.maintenance_services;
CREATE POLICY maintenance_services_company ON mdata.maintenance_services
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- GRANTs: a NEW table is not covered by the one-time GRANT ON ALL TABLES — grant explicitly (mutable catalog,
-- so full CRUD; soft-delete via is_active is app convention, DELETE kept for completeness).
GRANT USAGE ON SCHEMA mdata TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.maintenance_services TO ih35_app;

COMMENT ON TABLE mdata.maintenance_services IS
  'Maintenance services catalog (CLOSURE-11): reference list of PM/repair service types feeding Work Orders + ETA. One row per (operating_company_id, service_code).';

COMMIT;
