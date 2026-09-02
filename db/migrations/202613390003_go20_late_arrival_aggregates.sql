-- GO-20 slice H: persist daily driver late-arrival aggregates.
-- Schema only: rollup/routes/UI are independently owned; no fixture or production row is created.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.late_arrival_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  bucket_date date NOT NULL,
  stops_measured integer NOT NULL,
  stops_late integer NOT NULL,
  late_pct numeric NOT NULL,
  avg_minutes_late numeric NULL,
  worst_minutes_late integer NULL,
  basis text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_late_arrival_driver_day
  ON dispatch.late_arrival_aggregates (operating_company_id, driver_id, bucket_date);

CREATE INDEX IF NOT EXISTS ix_late_arrival_recent
  ON dispatch.late_arrival_aggregates (operating_company_id, bucket_date DESC);

ALTER TABLE dispatch.late_arrival_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.late_arrival_aggregates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS late_arrival_aggregates_company_scope ON dispatch.late_arrival_aggregates;
CREATE POLICY late_arrival_aggregates_company_scope
  ON dispatch.late_arrival_aggregates
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.late_arrival_aggregates TO ih35_app;
REVOKE DELETE ON dispatch.late_arrival_aggregates FROM ih35_app;

COMMIT;
