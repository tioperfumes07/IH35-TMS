-- R-158 item 7: additive deduction chain schema. Production application requires AUTH-034+.
CREATE TABLE IF NOT EXISTS accounting.customer_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  customer_id uuid NULL REFERENCES mdata.customers(id), load_id uuid NULL REFERENCES mdata.loads(id),
  reason_code text NOT NULL, amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','disputed','recovered','voided')),
  voided_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS driver_finance.driver_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id), load_id uuid NULL REFERENCES mdata.loads(id),
  reason_code text NOT NULL, amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  receivable_account_id uuid NULL REFERENCES catalogs.accounts(id), status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','disputed','recovered','voided')),
  voided_at timestamptz NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_deductions_company_idx ON accounting.customer_deductions (operating_company_id, status);
CREATE INDEX IF NOT EXISTS driver_deductions_company_driver_idx ON driver_finance.driver_deductions (operating_company_id, driver_id, status);
