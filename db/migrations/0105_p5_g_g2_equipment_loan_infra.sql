BEGIN;

CREATE TABLE IF NOT EXISTS banking.equipment_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id),
  lender_vendor_id uuid NOT NULL REFERENCES mdata.vendors(id),
  principal_cents bigint NOT NULL CHECK (principal_cents > 0),
  apr_percent numeric(7, 4) NOT NULL DEFAULT 0 CHECK (apr_percent >= 0),
  started_on date NOT NULL,
  maturity_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'defaulted', 'voided')),
  memo text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_loans_company_status
  ON banking.equipment_loans (operating_company_id, status, started_on DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_loans_company_equipment
  ON banking.equipment_loans (operating_company_id, equipment_id);

CREATE TABLE IF NOT EXISTS banking.equipment_loan_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  loan_id uuid NOT NULL REFERENCES banking.equipment_loans(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  attribution_date date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  memo text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_equipment_loan_attributions_loan
  ON banking.equipment_loan_attributions (loan_id, attribution_date DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_loan_attributions_load
  ON banking.equipment_loan_attributions (operating_company_id, load_id, attribution_date DESC);

CREATE TABLE IF NOT EXISTS banking.equipment_loan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  loan_id uuid NOT NULL REFERENCES banking.equipment_loans(id) ON DELETE CASCADE,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  principal_cents bigint NOT NULL DEFAULT 0 CHECK (principal_cents >= 0),
  interest_cents bigint NOT NULL DEFAULT 0 CHECK (interest_cents >= 0),
  fee_cents bigint NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  reference_number text,
  memo text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((principal_cents + interest_cents + fee_cents) <= amount_cents)
);

CREATE INDEX IF NOT EXISTS idx_equipment_loan_payments_loan
  ON banking.equipment_loan_payments (loan_id, paid_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_loan_payments_company_date
  ON banking.equipment_loan_payments (operating_company_id, paid_on DESC);

ALTER TABLE banking.equipment_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.equipment_loan_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.equipment_loan_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_equipment_loans_isolation ON banking.equipment_loans;
CREATE POLICY rls_equipment_loans_isolation
  ON banking.equipment_loans
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_equipment_loan_attributions_isolation ON banking.equipment_loan_attributions;
CREATE POLICY rls_equipment_loan_attributions_isolation
  ON banking.equipment_loan_attributions
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_equipment_loan_payments_isolation ON banking.equipment_loan_payments;
CREATE POLICY rls_equipment_loan_payments_isolation
  ON banking.equipment_loan_payments
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

COMMIT;
