-- ROUND 312 B-2 — QBO Make Deposit (Bank Deposits creator).
-- Claimed 202615171200 (Cursor HH 12). Additive CREATE IF NOT EXISTS + FORCE RLS.
-- Header accounting.deposits + lines linked to customer payments / factoring advances;
-- optional cash-back line. Void = reversal (voided_at), never DELETE (WORM trigger).
-- Live "already deposited" uniqueness is enforced in the create service against non-voided
-- deposits (void allows re-deposit; WORM forbids DELETE of lines).

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS accounting.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  display_id text NOT NULL,
  deposit_date date NOT NULL,
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  bank_ledger_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  undeposited_funds_account_id uuid NOT NULL REFERENCES catalogs.accounts(id),
  total_receipts_cents bigint NOT NULL CHECK (total_receipts_cents > 0),
  cash_back_cents bigint NOT NULL DEFAULT 0 CHECK (cash_back_cents >= 0),
  amount_deposited_cents bigint NOT NULL CHECK (amount_deposited_cents >= 0),
  cash_back_account_id uuid REFERENCES catalogs.accounts(id),
  memo text,
  reference_number text,
  journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  posting_status text NOT NULL DEFAULT 'unposted'
    CHECK (posting_status IN ('unposted', 'posted', 'reversed')),
  posted_at timestamptz,
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id),
  CONSTRAINT deposits_cash_back_account_pair CHECK (
    (cash_back_cents = 0 AND cash_back_account_id IS NULL)
    OR (cash_back_cents > 0 AND cash_back_account_id IS NOT NULL)
  ),
  CONSTRAINT deposits_amount_math CHECK (
    amount_deposited_cents = total_receipts_cents - cash_back_cents
  ),
  CONSTRAINT deposits_display_id_shape CHECK (display_id ~ '^DEP-[0-9]{4}-[0-9]{5}$')
);

CREATE TABLE IF NOT EXISTS accounting.deposit_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id uuid NOT NULL REFERENCES accounting.deposits(id),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  line_type text NOT NULL CHECK (line_type IN ('customer_payment', 'factoring_advance', 'cash_back')),
  source_payment_id uuid REFERENCES accounting.payments(id),
  source_factoring_advance_id uuid REFERENCES accounting.factoring_advances(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_lines_source_xor CHECK (
    (line_type = 'customer_payment' AND source_payment_id IS NOT NULL AND source_factoring_advance_id IS NULL)
    OR (line_type = 'factoring_advance' AND source_factoring_advance_id IS NOT NULL AND source_payment_id IS NULL)
    OR (line_type = 'cash_back' AND source_payment_id IS NULL AND source_factoring_advance_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_deposits_company_display_id
  ON accounting.deposits (operating_company_id, display_id);

CREATE INDEX IF NOT EXISTS idx_deposits_company_date
  ON accounting.deposits (operating_company_id, deposit_date DESC);

CREATE INDEX IF NOT EXISTS idx_deposit_lines_deposit
  ON accounting.deposit_lines (deposit_id);

CREATE INDEX IF NOT EXISTS idx_deposit_lines_payment
  ON accounting.deposit_lines (source_payment_id)
  WHERE source_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_lines_advance
  ON accounting.deposit_lines (source_factoring_advance_id)
  WHERE source_factoring_advance_id IS NOT NULL;

ALTER TABLE accounting.deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.deposits FORCE ROW LEVEL SECURITY;
ALTER TABLE accounting.deposit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.deposit_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deposits_company_isolation ON accounting.deposits;
CREATE POLICY deposits_company_isolation ON accounting.deposits
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

DROP POLICY IF EXISTS deposit_lines_company_isolation ON accounting.deposit_lines;
CREATE POLICY deposit_lines_company_isolation ON accounting.deposit_lines
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON accounting.deposits TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.deposit_lines TO ih35_app;
REVOKE DELETE ON accounting.deposits FROM ih35_app;
REVOKE DELETE ON accounting.deposit_lines FROM ih35_app;

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.deposits;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.deposits
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();

DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON accounting.deposit_lines;
CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON accounting.deposit_lines
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete();
