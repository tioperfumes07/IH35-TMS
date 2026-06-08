-- GAP-60 / CAP-10: Composite driver safety scores (weekly aggregation target).
BEGIN;

CREATE TABLE IF NOT EXISTS safety.driver_safety_scores (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_uuid UUID NOT NULL REFERENCES mdata.drivers(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  harsh_brake_count INTEGER NOT NULL DEFAULT 0,
  hard_accel_count INTEGER NOT NULL DEFAULT 0,
  speeding_seconds INTEGER NOT NULL DEFAULT 0,
  lane_departure_count INTEGER NOT NULL DEFAULT 0,
  miles_driven NUMERIC(10, 2) NOT NULL DEFAULT 0,
  composite_score NUMERIC(5, 2),
  rank_in_fleet INTEGER,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT driver_safety_scores_period_check CHECK (period_end >= period_start),
  CONSTRAINT driver_safety_scores_unique_period UNIQUE (driver_uuid, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_safety_scores_driver_period
  ON safety.driver_safety_scores (driver_uuid, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_safety_scores_company_period
  ON safety.driver_safety_scores (operating_company_id, period_end DESC, rank_in_fleet);

ALTER TABLE safety.driver_safety_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.driver_safety_scores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_safety_scores_tenant_scope ON safety.driver_safety_scores;
CREATE POLICY driver_safety_scores_tenant_scope ON safety.driver_safety_scores
  FOR ALL TO ih35_app
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT ON safety.driver_safety_scores TO ih35_app;

COMMIT;
