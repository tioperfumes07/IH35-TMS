-- DOT Violation Types catalog table (catalog backlog #7 — greenfield).
--
-- Safety-domain reference catalog for DOT/FMCSA roadside inspection violation types, used to classify
-- inspection findings for CSA/BASIC reporting. No table or endpoint existed before this; sibling safety
-- catalogs (civil_fine_types, company_violation_types, complaint_types) live in catalogs.* and this follows
-- the same shape + RLS + GRANT conventions. Pure ADDITIVE new table — the table does not exist, so there is
-- zero existing data to touch. No ALTER, no DML on existing tables, no financial table.
--
-- Columns match what the backend route (apps/backend/src/catalogs/safety/dot-violation-types.routes.ts)
-- reads/writes (no invention beyond the handler contract):
--   violation_code, display_name, description, basic_category, severity_weight, is_oos, is_active, sort_order.
--
-- basic_category CHECK deliberately EXCLUDES hazmat (CLAUDE.md: NO hazmat fields anywhere). FMCSA BASICs
-- minus Hazmat: unsafe_driving, hours_of_service, driver_fitness, controlled_substances, vehicle_maintenance,
-- crash_indicator.
--
-- Conventions (CLAUDE.md): server-generated PK, operating_company_id RLS scoping, per-entity policy
-- FOR ALL TO ih35_app, explicit GRANTs (a new table is NOT covered by the one-time GRANT ON ALL TABLES),
-- is_active soft-delete. Reversible: DROP TABLE catalogs.dot_violation_types;
BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.dot_violation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  violation_code text NOT NULL,
  display_name text NOT NULL,
  description text,
  basic_category text CHECK (
    basic_category IS NULL OR basic_category IN (
      'unsafe_driving',
      'hours_of_service',
      'driver_fitness',
      'controlled_substances',
      'vehicle_maintenance',
      'crash_indicator'
    )
  ),
  severity_weight integer CHECK (severity_weight IS NULL OR (severity_weight >= 1 AND severity_weight <= 10)),
  is_oos boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, violation_code)
);

-- Read pattern: list per company ordered by sort_order, violation_code (the GET handler's ORDER BY).
CREATE INDEX IF NOT EXISTS idx_dot_violation_types_company_order
  ON catalogs.dot_violation_types (operating_company_id, sort_order, violation_code);

-- RLS: per-entity, identical shape to the other catalogs.* safety catalogs.
ALTER TABLE catalogs.dot_violation_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dot_violation_types_company ON catalogs.dot_violation_types;
CREATE POLICY dot_violation_types_company ON catalogs.dot_violation_types
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- GRANTs: a NEW table is not covered by the one-time GRANT ON ALL TABLES — grant explicitly (mutable catalog,
-- full CRUD; soft-delete via is_active is app convention, DELETE kept for completeness).
GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.dot_violation_types TO ih35_app;

COMMENT ON TABLE catalogs.dot_violation_types IS
  'DOT/FMCSA roadside inspection violation types catalog (backlog #7): reference list classifying inspection findings for CSA/BASIC reporting. One row per (operating_company_id, violation_code). No hazmat category (per CLAUDE.md).';

COMMIT;
