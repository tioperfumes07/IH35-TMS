-- CLOSURE-4 P5-T12: Auto-deduction policies applied at driver settlement time.
BEGIN;

CREATE TABLE IF NOT EXISTS driver_finance.auto_deduction_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  deduction_type text NOT NULL CHECK (
    deduction_type IN ('damage', 'cash_advance', 'repair', 'fine', 'fuel_advance', 'other')
  ),
  total_owed_cents bigint NOT NULL CHECK (total_owed_cents > 0),
  deducted_so_far_cents bigint NOT NULL DEFAULT 0 CHECK (deducted_so_far_cents >= 0),
  max_per_settlement_cents bigint NOT NULL CHECK (max_per_settlement_cents > 0),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  memo text NULL,
  source_ref uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auto_deduction_policies_balance_chk CHECK (deducted_so_far_cents <= total_owed_cents)
);

CREATE INDEX IF NOT EXISTS ix_auto_deduction_policies_company_driver_status
  ON driver_finance.auto_deduction_policies (operating_company_id, driver_id, status);

ALTER TABLE driver_finance.auto_deduction_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auto_deduction_policies_tenant_scope ON driver_finance.auto_deduction_policies;
CREATE POLICY auto_deduction_policies_tenant_scope ON driver_finance.auto_deduction_policies
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE ON driver_finance.auto_deduction_policies TO ih35_app;

ALTER TABLE payroll.driver_settlement_line_items
  DROP CONSTRAINT IF EXISTS driver_settlement_line_items_line_type_check;

ALTER TABLE payroll.driver_settlement_line_items
  ADD CONSTRAINT driver_settlement_line_items_line_type_check CHECK (
    line_type IN (
      'mileage_pay',
      'load_pay',
      'bonus',
      'advance_recovery',
      'deduction',
      'driver_bond_deduction',
      'reimbursement',
      'auto_deduction'
    )
  );

ALTER TABLE payroll.driver_settlement_line_items
  ADD COLUMN IF NOT EXISTS auto_deduction_policy_id uuid NULL
    REFERENCES driver_finance.auto_deduction_policies(id);

ALTER TABLE driver_finance.settlement_lines
  DROP CONSTRAINT IF EXISTS settlement_lines_line_type_chk_p6_t11186;

ALTER TABLE driver_finance.settlement_lines
  ADD CONSTRAINT settlement_lines_line_type_chk_p6_t11186 CHECK (
    line_type IN (
      'earnings',
      'extra_pay',
      'reimbursement',
      'deduction',
      'abandonment_chargeback',
      'team_split_primary',
      'team_split_secondary',
      'auto_deduction'
    )
  );

ALTER TABLE driver_finance.settlement_lines
  ADD COLUMN IF NOT EXISTS auto_deduction_policy_id uuid NULL
    REFERENCES driver_finance.auto_deduction_policies(id);

COMMIT;
