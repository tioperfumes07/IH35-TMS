-- Block-20.1 foundation: closed-period cash-basis snapshot lock table.
BEGIN;

CREATE TABLE IF NOT EXISTS accounting.period_cash_basis_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  period_id uuid NOT NULL REFERENCES accounting.periods(id) ON DELETE CASCADE,
  snapshot_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by_user_uuid uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, period_id)
);

CREATE INDEX IF NOT EXISTS idx_period_cash_basis_snapshot_company_period
  ON accounting.period_cash_basis_snapshot (operating_company_id, period_id);

ALTER TABLE accounting.period_cash_basis_snapshot ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON accounting.period_cash_basis_snapshot TO ih35_app;

DROP POLICY IF EXISTS period_cash_basis_snapshot_company_scope ON accounting.period_cash_basis_snapshot;
CREATE POLICY period_cash_basis_snapshot_company_scope ON accounting.period_cash_basis_snapshot
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

COMMIT;
