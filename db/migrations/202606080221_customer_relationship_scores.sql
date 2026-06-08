-- GAP-72: Customer relationship health scoring.
BEGIN;

CREATE SCHEMA IF NOT EXISTS master_data;
GRANT USAGE ON SCHEMA master_data TO ih35_app;

CREATE TABLE IF NOT EXISTS master_data.customer_relationship_scores (
  customer_uuid UUID PRIMARY KEY REFERENCES mdata.customers(id) ON DELETE CASCADE,
  operating_company_id UUID NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overall_health_score NUMERIC(5, 2) NOT NULL CHECK (overall_health_score >= 0 AND overall_health_score <= 100),
  health_tier TEXT NOT NULL CHECK (health_tier IN ('thriving', 'healthy', 'watch', 'at_risk')),
  engagement_subscore NUMERIC(5, 2),
  payment_behavior_subscore NUMERIC(5, 2),
  service_quality_subscore NUMERIC(5, 2),
  margin_trend_subscore NUMERIC(5, 2),
  complaint_subscore NUMERIC(5, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_relationship_scores_company_tier
  ON master_data.customer_relationship_scores (operating_company_id, health_tier, overall_health_score DESC);

ALTER TABLE master_data.customer_relationship_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data.customer_relationship_scores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_relationship_scores_tenant_scope
  ON master_data.customer_relationship_scores;

CREATE POLICY customer_relationship_scores_tenant_scope
  ON master_data.customer_relationship_scores
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON master_data.customer_relationship_scores TO ih35_app;

COMMIT;
