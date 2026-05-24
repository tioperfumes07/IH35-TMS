BEGIN;

CREATE SCHEMA IF NOT EXISTS payroll;

CREATE TABLE IF NOT EXISTS payroll.driver_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  pay_period_start date NOT NULL,
  pay_period_end date NOT NULL,
  gross_cents bigint NOT NULL CHECK (gross_cents >= 0),
  deductions_cents bigint NOT NULL DEFAULT 0 CHECK (deductions_cents >= 0),
  net_cents bigint GENERATED ALWAYS AS (gross_cents - deductions_cents) STORED,
  bank_settle_date date NULL,
  accounting_bill_id uuid NULL REFERENCES accounting.bills(id),
  accounting_bill_payment_id uuid NULL REFERENCES accounting.bill_payments(id),
  qbo_bill_id text NULL,
  qbo_bill_payment_id text NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','synced','paid','void')),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  posted_by_user_id uuid NULL REFERENCES identity.users(id),
  posted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_payroll_driver_settlements_company_driver_period
  ON payroll.driver_settlements (operating_company_id, driver_id, pay_period_start, pay_period_end);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_driver_settlements_company_driver_period
  ON payroll.driver_settlements (operating_company_id, driver_id, pay_period_start, pay_period_end);

CREATE TABLE IF NOT EXISTS payroll.driver_settlement_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES payroll.driver_settlements(id) ON DELETE CASCADE,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  line_type text NOT NULL CHECK (
    line_type IN (
      'mileage_pay',
      'load_pay',
      'bonus',
      'advance_recovery',
      'deduction',
      'driver_bond_deduction',
      'reimbursement'
    )
  ),
  load_id uuid NULL REFERENCES mdata.loads(id),
  description text NOT NULL,
  amount_cents bigint NOT NULL,
  posting_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_payroll_driver_settlement_lines_settlement
  ON payroll.driver_settlement_line_items (settlement_id, created_at);

CREATE OR REPLACE FUNCTION payroll.touch_driver_settlement_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_driver_settlement_touch ON payroll.driver_settlements;
CREATE TRIGGER trg_payroll_driver_settlement_touch
  BEFORE UPDATE ON payroll.driver_settlements
  FOR EACH ROW EXECUTE FUNCTION payroll.touch_driver_settlement_updated_at();

DROP TRIGGER IF EXISTS trg_payroll_driver_settlement_lines_touch ON payroll.driver_settlement_line_items;
CREATE TRIGGER trg_payroll_driver_settlement_lines_touch
  BEFORE UPDATE ON payroll.driver_settlement_line_items
  FOR EACH ROW EXECUTE FUNCTION payroll.touch_driver_settlement_updated_at();

CREATE OR REPLACE FUNCTION payroll.prevent_driver_settlement_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payroll.driver_settlements is append-only for deletes';
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_driver_settlements_no_delete ON payroll.driver_settlements;
CREATE TRIGGER trg_payroll_driver_settlements_no_delete
  BEFORE DELETE ON payroll.driver_settlements
  FOR EACH ROW EXECUTE FUNCTION payroll.prevent_driver_settlement_deletion();

CREATE OR REPLACE FUNCTION payroll.prevent_driver_settlement_line_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'payroll.driver_settlement_line_items is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_payroll_driver_settlement_lines_no_update ON payroll.driver_settlement_line_items;
CREATE TRIGGER trg_payroll_driver_settlement_lines_no_update
  BEFORE UPDATE ON payroll.driver_settlement_line_items
  FOR EACH ROW EXECUTE FUNCTION payroll.prevent_driver_settlement_line_mutation();

DROP TRIGGER IF EXISTS trg_payroll_driver_settlement_lines_no_delete ON payroll.driver_settlement_line_items;
CREATE TRIGGER trg_payroll_driver_settlement_lines_no_delete
  BEFORE DELETE ON payroll.driver_settlement_line_items
  FOR EACH ROW EXECUTE FUNCTION payroll.prevent_driver_settlement_line_mutation();

ALTER TABLE payroll.driver_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll.driver_settlement_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_driver_settlements_company_scope ON payroll.driver_settlements;
CREATE POLICY payroll_driver_settlements_company_scope
  ON payroll.driver_settlements
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS payroll_driver_settlement_lines_company_scope ON payroll.driver_settlement_line_items;
CREATE POLICY payroll_driver_settlement_lines_company_scope
  ON payroll.driver_settlement_line_items
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON payroll.driver_settlements TO ih35_app;
GRANT SELECT, INSERT ON payroll.driver_settlement_line_items TO ih35_app;

COMMIT;
