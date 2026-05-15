-- Block I — MVP settlement preview cost rows (fuel + cash advance) for integration preview math.
BEGIN;

CREATE TABLE IF NOT EXISTS driver_finance.settlement_preview_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  cost_kind text NOT NULL CHECK (cost_kind IN ('fuel', 'cash_advance')),
  amount_dollars numeric(12, 2) NOT NULL CHECK (amount_dollars >= 0),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS ix_settlement_preview_costs_lookup
  ON driver_finance.settlement_preview_costs (operating_company_id, driver_id, period_start, period_end);

ALTER TABLE driver_finance.settlement_preview_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_preview_costs_company_scope ON driver_finance.settlement_preview_costs;
CREATE POLICY settlement_preview_costs_company_scope ON driver_finance.settlement_preview_costs
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON driver_finance.settlement_preview_costs TO ih35_app;
  END IF;
END
$$;

COMMIT;
