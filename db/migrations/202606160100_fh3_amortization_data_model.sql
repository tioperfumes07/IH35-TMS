-- FH-3 Amortization Schedule Engine — data model (no posting, no cron).
-- Stores loans + their generated amortization rows. Reuses FH-2 loan-math for the schedule.
-- Tier 3 / BOOK-ONLY: this migration creates the tables + registers the gated flag. POSTING the
-- principal/interest split (Dr Note Payable / Dr Interest Expense / Cr cash) is a LATER gated step
-- behind FINANCE_HUB_AMORTIZATION_POST_ENABLED. The posted/journal columns exist now as forward hooks.
-- New schema finance.* — tenant-scoped (operating_company_id), RLS ENABLE+FORCE, is_active +
-- soft-delete + audit cols. Idempotent. See docs spec 04-FH-3-AMORTIZATION.

BEGIN;

CREATE SCHEMA IF NOT EXISTS finance;

-- 1. loans -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance.loans (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id          uuid NOT NULL REFERENCES org.companies(id),
  name                          text NOT NULL,
  lender                        text,
  original_principal_cents      bigint NOT NULL CHECK (original_principal_cents > 0),
  interest_rate_bps             int  NOT NULL CHECK (interest_rate_bps >= 0),   -- basis points (650 = 6.50%)
  term_months                   int  NOT NULL CHECK (term_months > 0),
  first_payment_date            date NOT NULL,
  gl_liability_account_id       uuid REFERENCES catalogs.accounts(id),         -- Note/Loan Payable
  gl_interest_expense_account_id uuid REFERENCES catalogs.accounts(id),        -- Interest Expense
  payment_account_id            uuid REFERENCES catalogs.accounts(id),         -- cash/bank
  status                        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paid_off','refinanced','closed')),
  is_active                     boolean NOT NULL DEFAULT true,
  deleted_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by_user_id            uuid REFERENCES identity.users(id),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id            uuid REFERENCES identity.users(id)
);
CREATE INDEX IF NOT EXISTS idx_fin_loans_company ON finance.loans (operating_company_id, status);

-- 2. amortization rows (one per scheduled payment; regeneratable, audited) --------------------
CREATE TABLE IF NOT EXISTS finance.loan_amortization_rows (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id          uuid NOT NULL REFERENCES org.companies(id),
  loan_id                       uuid NOT NULL REFERENCES finance.loans(id) ON DELETE RESTRICT,
  payment_number                int  NOT NULL,
  due_date                      date NOT NULL,
  payment_cents                 bigint NOT NULL DEFAULT 0,
  principal_cents               bigint NOT NULL DEFAULT 0,
  interest_cents                bigint NOT NULL DEFAULT 0,
  remaining_balance_cents       bigint NOT NULL DEFAULT 0,
  posted                        boolean NOT NULL DEFAULT false,                -- forward hook (posting is a LATER gated step)
  posted_journal_entry_id       uuid REFERENCES accounting.journal_entries(id),
  is_active                     boolean NOT NULL DEFAULT true,                 -- old rows retained (is_active=false) on regen
  deleted_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by_user_id            uuid REFERENCES identity.users(id),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id            uuid REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_amort_active_payment
  ON finance.loan_amortization_rows (loan_id, payment_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fin_amort_company_loan ON finance.loan_amortization_rows (operating_company_id, loan_id);

-- 3. GRANTs (new schema — per CLAUDE.md §15) ------------------------------------------------
GRANT USAGE ON SCHEMA finance TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA finance TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;

-- 4. RLS (tenant isolation by operating_company_id) — explicit per table (static-scannable) -
ALTER TABLE finance.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.loans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loans_company_isolation ON finance.loans;
CREATE POLICY loans_company_isolation ON finance.loans FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE finance.loan_amortization_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.loan_amortization_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loan_amortization_rows_company_isolation ON finance.loan_amortization_rows;
CREATE POLICY loan_amortization_rows_company_isolation ON finance.loan_amortization_rows FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- 5. register the gated flags (default OFF) -------------------------------------------------
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('FINANCE_HUB_AMORTIZATION_ENABLED', 'FH-3 Amortization engine — create loans + generate/store schedules (no posting). Default OFF.', false),
  ('FINANCE_HUB_AMORTIZATION_POST_ENABLED', 'FH-3 amortization payment posting (Dr Note Payable / Dr Interest / Cr cash). LATER gated step. Default OFF.', false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK (greenfield schema): DROP SCHEMA finance CASCADE;
--   DELETE FROM lib.feature_flags WHERE flag_key IN ('FINANCE_HUB_AMORTIZATION_ENABLED','FINANCE_HUB_AMORTIZATION_POST_ENABLED');
