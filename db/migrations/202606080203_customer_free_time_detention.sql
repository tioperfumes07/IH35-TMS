-- GAP-32: customer free-time detention catalog + terms history audit
BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS free_time_minutes integer NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS detention_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS detention_requires_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS terms_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_updated_by_user_uuid uuid REFERENCES identity.users(id);

CREATE SCHEMA IF NOT EXISTS master_data;
GRANT USAGE ON SCHEMA master_data TO ih35_app;

CREATE TABLE IF NOT EXISTS master_data.customer_terms_history (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_uuid uuid NOT NULL REFERENCES mdata.customers(id) ON DELETE CASCADE,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  free_time_minutes integer NOT NULL CHECK (free_time_minutes >= 0),
  detention_rate_per_hour numeric(8, 2) NOT NULL CHECK (detention_rate_per_hour >= 0),
  detention_currency text NOT NULL DEFAULT 'USD',
  detention_requires_approval boolean NOT NULL DEFAULT true,
  terms_updated_at timestamptz NOT NULL DEFAULT now(),
  terms_updated_by_user_uuid uuid REFERENCES identity.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (operating_company_id = tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_terms_history_customer_recorded
  ON master_data.customer_terms_history (customer_uuid, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_terms_history_company_recorded
  ON master_data.customer_terms_history (operating_company_id, recorded_at DESC);

ALTER TABLE master_data.customer_terms_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_terms_history_tenant_scope ON master_data.customer_terms_history;
CREATE POLICY customer_terms_history_tenant_scope
  ON master_data.customer_terms_history
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1
      FROM mdata.customers c
      WHERE c.id = customer_terms_history.customer_uuid
        AND c.operating_company_id = customer_terms_history.operating_company_id
        AND c.operating_company_id = customer_terms_history.tenant_id
        AND c.operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR EXISTS (
      SELECT 1
      FROM mdata.customers c
      WHERE c.id = customer_terms_history.customer_uuid
        AND c.operating_company_id = customer_terms_history.operating_company_id
        AND c.operating_company_id = customer_terms_history.tenant_id
        AND c.operating_company_id::text = current_setting('app.operating_company_id', true)
    )
  );

GRANT SELECT, INSERT, UPDATE ON master_data.customer_terms_history TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA master_data
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA master_data
  GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

COMMIT;
