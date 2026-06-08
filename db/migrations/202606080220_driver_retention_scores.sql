-- GAP-71: Driver retention predictive scores.
BEGIN;

CREATE SCHEMA IF NOT EXISTS drivers;
GRANT USAGE ON SCHEMA drivers TO ih35_app;

CREATE TABLE IF NOT EXISTS drivers.retention_scores (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  driver_uuid UUID NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retention_risk_score NUMERIC(5, 2) NOT NULL CHECK (retention_risk_score >= 0 AND retention_risk_score <= 100),
  retention_tier TEXT NOT NULL CHECK (retention_tier IN ('stable', 'watch', 'at_risk', 'critical')),
  contributing_factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (driver_uuid, computed_at)
);

CREATE INDEX IF NOT EXISTS idx_retention_at_risk
  ON drivers.retention_scores (retention_tier, computed_at DESC)
  WHERE retention_tier IN ('at_risk', 'critical');

ALTER TABLE drivers.retention_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers.retention_scores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_scores_tenant_scope ON drivers.retention_scores;
CREATE POLICY retention_scores_tenant_scope ON drivers.retention_scores
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT ON drivers.retention_scores TO ih35_app;

COMMIT;
