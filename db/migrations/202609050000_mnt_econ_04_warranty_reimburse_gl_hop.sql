-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] MNT-ECON-04 — warranty reimbursement GL hop.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. DO NOT flip
--     WARRANTY_REIMBURSE_GL_POSTING_ENABLED. Flag DEFAULT OFF. Owner Neon-applies. ***
--
-- CANONICAL-CHECK: warranty_reimburse_posting. accounting.warranty_reimburse_postings is a
-- LINKAGE ledger (claim → JE), not a money ledger. Money lives in journal_entries via
-- createJournalEntry. Mirrors civil_fine_postings / parts_purchase_postings.
--
-- FINDING (FOR-CURSOR 4 · MNT-ECON-04): reimburse stamps status/amount only — no JE.
-- Accounting: Dr cash_clearing / Cr warranty_recovery (owner designates — contra to repair
-- expense; NEVER sales income). NO GL math in this file.

BEGIN;

DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
    VALUES (
      'WARRANTY_REIMBURSE_GL_POSTING_ENABLED',
      'MNT-ECON-04: warranty claim reimburse posts balanced JE '
        || '(Dr cash_clearing / Cr warranty_recovery) via createJournalEntry. '
        || 'Per-entity override only. Default OFF until owner designates warranty_recovery and cutover.',
      false
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.journal_entries') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'accounting')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'identity' AND p.proname = 'is_lucia_bypass') THEN
    RAISE NOTICE 'warranty_reimburse_postings: prerequisites absent — skipping';
  ELSE
  CREATE TABLE IF NOT EXISTS accounting.warranty_reimburse_postings (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL,
    warranty_claim_id     uuid NOT NULL,
    expense_je_id         uuid,
    amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
    entry_date            date NOT NULL,
    memo                  text,
    status                text NOT NULL DEFAULT 'posted'
                            CHECK (status IN ('posted','voided')),
    is_active             boolean NOT NULL DEFAULT true,
    voided_at             timestamptz,
    voided_by_user_id     uuid,
    void_reason           text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by_user_id    uuid
  );

  IF to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_reimburse_postings_company') THEN
    ALTER TABLE accounting.warranty_reimburse_postings
      ADD CONSTRAINT fk_warranty_reimburse_postings_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  IF to_regclass('maintenance.warranty_claims') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_reimburse_postings_claim') THEN
    ALTER TABLE accounting.warranty_reimburse_postings
      ADD CONSTRAINT fk_warranty_reimburse_postings_claim
      FOREIGN KEY (warranty_claim_id) REFERENCES maintenance.warranty_claims(id);
  END IF;

  IF to_regclass('accounting.journal_entries') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_warranty_reimburse_postings_je') THEN
    ALTER TABLE accounting.warranty_reimburse_postings
      ADD CONSTRAINT fk_warranty_reimburse_postings_je
      FOREIGN KEY (expense_je_id) REFERENCES accounting.journal_entries(id);
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_warranty_reimburse_postings_claim_active
    ON accounting.warranty_reimburse_postings (operating_company_id, warranty_claim_id)
    WHERE is_active;
  CREATE INDEX IF NOT EXISTS ix_warranty_reimburse_postings_je
    ON accounting.warranty_reimburse_postings (expense_je_id) WHERE expense_je_id IS NOT NULL;

  ALTER TABLE accounting.warranty_reimburse_postings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.warranty_reimburse_postings FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS warranty_reimburse_postings_select ON accounting.warranty_reimburse_postings;
  DROP POLICY IF EXISTS warranty_reimburse_postings_write  ON accounting.warranty_reimburse_postings;
  CREATE POLICY warranty_reimburse_postings_select ON accounting.warranty_reimburse_postings FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY warranty_reimburse_postings_write ON accounting.warranty_reimburse_postings FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  GRANT SELECT, INSERT, UPDATE ON accounting.warranty_reimburse_postings TO ih35_app;
  REVOKE DELETE ON accounting.warranty_reimburse_postings FROM ih35_app;
  END IF;
END
$$;

-- Role CHECK widen LAST — TRUE SUPERSET of 202608110000 (+ warranty_recovery).
-- If MNT-ECON-01 (maintenance_parts_expense) applied first, reconcile at owner apply time.
DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL THEN
    ALTER TABLE accounting.chart_of_accounts_roles
      DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
    ALTER TABLE accounting.chart_of_accounts_roles
      ADD CONSTRAINT chart_of_accounts_roles_role_check
      CHECK (role IN (
        'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
        'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
        'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
        'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
        'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
        'default_interest_expense','factor_reserve_held','factor_fee_expense',
        'property_tax_expense','property_tax_payable',
        'driver_pay_expense','driver_payroll_clearing','reimbursement_expense',
        'advance_recovery','damage_recovery','lease_recovery','insurance_recovery',
        'fuel_advance_recovery','other_recovery',
        'abandonment_chargeback_recovery',
        'cash_dip',
        'civil_fines_expense',
        'maintenance_parts_expense',
        'warranty_recovery'
      ));
  END IF;

  IF to_regclass('catalogs.account_role_bindings') IS NOT NULL THEN
    ALTER TABLE catalogs.account_role_bindings
      DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_check;
    ALTER TABLE catalogs.account_role_bindings
      ADD CONSTRAINT account_role_bindings_role_key_check CHECK (
        role_key = ANY (ARRAY[
          'ar_clearing', 'ap_clearing', 'cash_dip', 'cash_payroll', 'cash_petty',
          'fuel_expense', 'maintenance_expense', 'driver_payroll_clearing',
          'factor_advances_receivable', 'factor_chargebacks_payable', 'undeposited_funds',
          'driver_pay_expense', 'reimbursement_expense',
          'advance_recovery', 'damage_recovery', 'lease_recovery', 'insurance_recovery',
          'fuel_advance_recovery', 'other_recovery',
          'rental_income', 'lease_receivable', 'interest_income', 'gain_loss_on_disposal',
          'factoring_advance_liability', 'ar_assigned_to_factor', 'factoring_recoursed_ar',
          'default_interest_expense', 'factor_reserve_held', 'factor_fee_expense',
          'property_tax_expense', 'property_tax_payable',
          'abandonment_chargeback_recovery',
          'civil_fines_expense',
          'maintenance_parts_expense',
          'warranty_recovery'
        ])
      );
  END IF;
END
$$;

COMMIT;
