-- GAP-28: Driver layover detection (>8h gap between delivery and next assignment).
-- Supports billable flag for customer billing and per-diem eligibility tracking.
-- Non-financial: flags only, no amount calculations.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.driver_layovers (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  driver_uuid UUID NOT NULL,
  previous_load_uuid UUID NOT NULL,
  next_load_uuid UUID,
  layover_started_at TIMESTAMPTZ NOT NULL,
  layover_ended_at TIMESTAMPTZ,
  duration_hours NUMERIC(6,2) GENERATED ALWAYS AS (
    CASE WHEN layover_ended_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (layover_ended_at - layover_started_at)) / 3600.0
    ELSE NULL END
  ) STORED,
  layover_location TEXT,
  billable_to_customer BOOLEAN NOT NULL DEFAULT false,
  per_diem_eligible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_layover_driver
  ON dispatch.driver_layovers(driver_uuid, layover_started_at DESC);
CREATE INDEX IF NOT EXISTS idx_layover_company
  ON dispatch.driver_layovers(operating_company_id, layover_started_at DESC);

ALTER TABLE dispatch.driver_layovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.driver_layovers FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_layovers_tenant_isolation ON dispatch.driver_layovers
  USING (operating_company_id::uuid IN (SELECT org.user_accessible_company_ids()));

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.driver_layovers TO ih35_app;

COMMIT;
