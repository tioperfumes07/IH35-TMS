-- Block 20: Deadhead optimization — load deadhead columns + per-truck weekly cache
BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS loaded_miles INTEGER CHECK (loaded_miles IS NULL OR loaded_miles >= 0),
  ADD COLUMN IF NOT EXISTS deadhead_miles_to_pickup INTEGER CHECK (deadhead_miles_to_pickup IS NULL OR deadhead_miles_to_pickup >= 0),
  ADD COLUMN IF NOT EXISTS deadhead_miles_calculation_method TEXT
    CHECK (
      deadhead_miles_calculation_method IN ('samsara', 'manual', 'estimated')
      OR deadhead_miles_calculation_method IS NULL
    );

CREATE TABLE IF NOT EXISTS reports.deadhead_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  unit_id UUID NOT NULL,
  week_starting DATE NOT NULL,
  total_miles INTEGER NOT NULL DEFAULT 0,
  loaded_miles INTEGER NOT NULL DEFAULT 0,
  deadhead_miles INTEGER NOT NULL DEFAULT 0,
  deadhead_pct NUMERIC,
  load_count INTEGER NOT NULL DEFAULT 0,
  fleet_avg_deadhead_pct NUMERIC,
  rank_in_fleet INTEGER,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deadhead_unit ON reports.deadhead_cache(unit_id);
CREATE INDEX IF NOT EXISTS idx_deadhead_week ON reports.deadhead_cache(week_starting DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_deadhead_unit_week ON reports.deadhead_cache(unit_id, week_starting);

ALTER TABLE reports.deadhead_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deadhead_company_isolation ON reports.deadhead_cache;
CREATE POLICY deadhead_company_isolation ON reports.deadhead_cache
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE ON reports.deadhead_cache TO ih35_app;

COMMIT;
