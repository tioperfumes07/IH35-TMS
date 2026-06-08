-- Migration: 202606080200_cash_flow_adjustments
-- Cash Flow module: manual add-ins table for daily prediction.
-- Additive only. ARCHIVE never DELETE (archived_at marks removal).

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.cash_flow_adjustments (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid          NOT NULL
    REFERENCES org.companies(id) ON DELETE RESTRICT,
  entry_date            date          NOT NULL,
  label                 text          NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 500),
  amount_cents          integer       NOT NULL,
  created_by_user_id    uuid          NOT NULL
    REFERENCES identity.users(id) ON DELETE RESTRICT,
  archived_at           timestamptz   NULL,
  created_at            timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_flow_adjustments_company_date_idx
  ON accounting.cash_flow_adjustments (operating_company_id, entry_date)
  WHERE archived_at IS NULL;

-- Row-level security: tenant isolation by operating_company_id
ALTER TABLE accounting.cash_flow_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cash_flow_adjustments_company_isolation ON accounting.cash_flow_adjustments;
CREATE POLICY cash_flow_adjustments_company_isolation
  ON accounting.cash_flow_adjustments
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

-- Grants for application role
GRANT SELECT, INSERT, UPDATE ON accounting.cash_flow_adjustments TO ih35_app;

COMMIT;
