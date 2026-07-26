-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] MNT-ECON-01 — standalone parts purchase A/P + GL hop.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. DO NOT flip
--     PARTS_PURCHASE_GL_POSTING_ENABLED. Flag is registered DEFAULT OFF and stays OFF until
--     final cutover. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill. ***
--
-- CANONICAL-CHECK: parts_purchase_posting. accounting.parts_purchase_postings is a LINKAGE/
-- provenance ledger (parts_inventory row -> bill and/or expense JE), NOT a money ledger. It stores
-- NO debit/credit and NO balance: money lives in accounting.bills + accounting.journal_entries
-- written by createBill / postSourceTransaction('bill') / createJournalEntry. This table only
-- records WHICH bill/JE a given maintenance.parts_inventory purchase produced (Total-Connectivity
-- + idempotency latch). Mirrors accounting.civil_fine_postings / property_tax_accruals.
--
-- FINDING (FOR-CURSOR 4 · MNT-ECON-01): parts-inventory.routes.ts purchases INSERT stock only —
-- no A/P bill, no JE. FIX is in the poster (apps/backend/src/accounting/parts-inventory-posting/);
-- this migration is scaffolding only (flag + role + linkage table). NO GL math here.
--
-- POLICY: periodic expense-on-purchase (maintenance_parts_expense). Owner designates the account.
-- Perpetual inventory_asset (mod13 Option B) is NOT built here.
--
-- FRESH-DB SAFE / IDEMPOTENT / void-not-delete. CHECK widen = TRUE SUPERSET of 202608110000
-- (adds maintenance_parts_expense after civil_fines_expense).

BEGIN;

-- §1 — Feature flag DEFAULT OFF
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
    VALUES (
      'PARTS_PURCHASE_GL_POSTING_ENABLED',
      'MNT-ECON-01: standalone parts purchase creates A/P bill + balanced JE '
        || '(Dr maintenance_parts_expense / Cr ap_control or cash_clearing) via the shared poster. '
        || 'Per-entity override only. Default OFF until owner designates the role and authorizes cutover.',
      false
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END
$$;

-- §2 — Linkage ledger
DO $$
BEGIN
  IF to_regclass('accounting.journal_entries') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'accounting')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'identity' AND p.proname = 'is_lucia_bypass') THEN
    RAISE NOTICE 'parts_purchase_postings: prerequisites absent — skipping (clean no-op)';
  ELSE
  CREATE TABLE IF NOT EXISTS accounting.parts_purchase_postings (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL,
    parts_inventory_id    uuid NOT NULL,
    bill_id               uuid,
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
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parts_purchase_postings_company') THEN
    ALTER TABLE accounting.parts_purchase_postings
      ADD CONSTRAINT fk_parts_purchase_postings_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  IF to_regclass('maintenance.parts_inventory') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parts_purchase_postings_parts') THEN
    ALTER TABLE accounting.parts_purchase_postings
      ADD CONSTRAINT fk_parts_purchase_postings_parts
      FOREIGN KEY (parts_inventory_id) REFERENCES maintenance.parts_inventory(id);
  END IF;

  IF to_regclass('accounting.bills') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parts_purchase_postings_bill') THEN
    ALTER TABLE accounting.parts_purchase_postings
      ADD CONSTRAINT fk_parts_purchase_postings_bill
      FOREIGN KEY (bill_id) REFERENCES accounting.bills(id);
  END IF;

  IF to_regclass('accounting.journal_entries') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parts_purchase_postings_je') THEN
    ALTER TABLE accounting.parts_purchase_postings
      ADD CONSTRAINT fk_parts_purchase_postings_je
      FOREIGN KEY (expense_je_id) REFERENCES accounting.journal_entries(id);
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_purchase_postings_parts_active
    ON accounting.parts_purchase_postings (operating_company_id, parts_inventory_id)
    WHERE is_active;
  CREATE INDEX IF NOT EXISTS ix_parts_purchase_postings_bill
    ON accounting.parts_purchase_postings (bill_id) WHERE bill_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_parts_purchase_postings_je
    ON accounting.parts_purchase_postings (expense_je_id) WHERE expense_je_id IS NOT NULL;

  ALTER TABLE accounting.parts_purchase_postings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.parts_purchase_postings FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS parts_purchase_postings_select ON accounting.parts_purchase_postings;
  DROP POLICY IF EXISTS parts_purchase_postings_write  ON accounting.parts_purchase_postings;
  CREATE POLICY parts_purchase_postings_select ON accounting.parts_purchase_postings FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY parts_purchase_postings_write ON accounting.parts_purchase_postings FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  GRANT SELECT, INSERT, UPDATE ON accounting.parts_purchase_postings TO ih35_app;
  REVOKE DELETE ON accounting.parts_purchase_postings FROM ih35_app;
  END IF;
END
$$;

-- §3 — Role CHECK widen LAST (TRUE SUPERSET) — schema-parity window safety
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
        -- NEW (this migration) — periodic parts expense. Owner designates; no shape-fallback.
        'maintenance_parts_expense'
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
          'maintenance_parts_expense'
        ])
      );
  END IF;
END
$$;

COMMIT;
