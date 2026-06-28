-- CLOSURE-12 Cycle 5: payroll aggregate cache for TMS↔QBO unified labor view.
BEGIN;

CREATE SCHEMA IF NOT EXISTS payroll_integration;
GRANT USAGE ON SCHEMA payroll_integration TO ih35_app;

CREATE TABLE IF NOT EXISTS payroll_integration.aggregate_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  last_refreshed_at timestamptz NOT NULL DEFAULT now(),
  driver_settlements_total_cents bigint NOT NULL DEFAULT 0,
  w2_payroll_total_cents bigint NOT NULL DEFAULT 0,
  benefits_total_cents bigint NOT NULL DEFAULT 0,
  taxes_employer_total_cents bigint NOT NULL DEFAULT 0,
  grand_total_labor_cents bigint NOT NULL DEFAULT 0,
  allocation_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  by_person_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS ix_payroll_aggregate_cache_company_period
  ON payroll_integration.aggregate_cache (operating_company_id, period_start, period_end);

ALTER TABLE payroll_integration.aggregate_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_aggregate_cache_tenant_scope ON payroll_integration.aggregate_cache;
CREATE POLICY payroll_aggregate_cache_tenant_scope ON payroll_integration.aggregate_cache
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON payroll_integration.aggregate_cache TO ih35_app;

COMMIT;
