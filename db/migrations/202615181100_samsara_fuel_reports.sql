-- 202615181100_samsara_fuel_reports.sql
-- ROUND 313 E-23 (claim #23851). Samsara's Fuel & Energy report (GET /fleet/reports/{vehicles|drivers}/fuel-energy,
-- 200 on the USMCA token) was read on demand only (T-50) -- nothing kept it, so no screen or engine could show a
-- truck's or driver's burned gallons, miles and MPG over time next to what was purchased. One row per subject
-- (vehicle or driver) per day:
--   * vehicle rows link to mdata.units (Samsara vehicle id -> unit map); driver rows to mdata.drivers (canonical
--     driver_samsara_accounts map). Unmapped subjects are kept with a NULL link, never guessed.
--   * purchased_gal / purchase_count: the eligible fuel.fuel_transactions on that unit that day (T-45 gate, reefer
--     fuel excluded) -- the fuel-transaction side of the link; the rows themselves join back by (unit_id, day).
-- Additive; FORCED RLS.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS integrations.samsara_fuel_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  report_date date NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('vehicle', 'driver')),
  samsara_subject_id text NOT NULL,
  subject_name text NULL,
  unit_id uuid NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  fuel_burned_gal numeric NULL,
  distance_mi numeric NULL,
  efficiency_mpg numeric NULL,
  engine_run_hours numeric NULL,
  engine_idle_hours numeric NULL,
  purchased_gal numeric NULL,
  purchase_count integer NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT samsara_fuel_reports_subject_link CHECK (
    (subject_kind = 'vehicle' AND driver_id IS NULL) OR (subject_kind = 'driver' AND unit_id IS NULL)),
  CONSTRAINT samsara_fuel_reports_one_per_day UNIQUE (operating_company_id, subject_kind, samsara_subject_id, report_date)
);
CREATE INDEX IF NOT EXISTS samsara_fuel_reports_unit_day_idx ON integrations.samsara_fuel_reports (unit_id, report_date DESC);
CREATE INDEX IF NOT EXISTS samsara_fuel_reports_driver_day_idx ON integrations.samsara_fuel_reports (driver_id, report_date DESC);

ALTER TABLE integrations.samsara_fuel_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.samsara_fuel_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS samsara_fuel_reports_company_isolation ON integrations.samsara_fuel_reports;
CREATE POLICY samsara_fuel_reports_company_isolation ON integrations.samsara_fuel_reports
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON integrations.samsara_fuel_reports TO ih35_app;

COMMENT ON TABLE integrations.samsara_fuel_reports IS
  'E-23: daily Samsara fuel/energy per vehicle and per driver; vehicle rows carry purchased_gal from eligible fuel.fuel_transactions (join by unit_id + day).';

COMMIT;
