BEGIN;

CREATE TABLE IF NOT EXISTS accounting.cash_forecast_settings (
  operating_company_id uuid PRIMARY KEY,
  fuel_estimate_weekly_cents bigint NOT NULL DEFAULT 0 CHECK (fuel_estimate_weekly_cents >= 0),
  insurance_weekly_cents bigint NOT NULL DEFAULT 0 CHECK (insurance_weekly_cents >= 0),
  lease_weekly_cents bigint NOT NULL DEFAULT 0 CHECK (lease_weekly_cents >= 0),
  payroll_weekly_cents bigint NOT NULL DEFAULT 0 CHECK (payroll_weekly_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL
);

ALTER TABLE accounting.cash_forecast_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_cash_forecast_settings_company ON accounting.cash_forecast_settings;
CREATE POLICY rls_cash_forecast_settings_company
  ON accounting.cash_forecast_settings
  USING (operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON accounting.cash_forecast_settings TO ih35_app;

COMMIT;
