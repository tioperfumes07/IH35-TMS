-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] DISP-01 — two-event delivery revenue latch scaffolding.
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. ***
-- Earn-first ASC 606 (owner-locked 2026-07-19 / blueprint §18):
--   Event 1 (delivered / delivered_pending_docs): DR Unbilled Revenue / CR Line-Haul Income
--   Event 2 (completed_docs_received / POD):       DR A/R / CR Unbilled Revenue
-- This migration POSTS NOTHING. Poster reuses accounting.createJournalEntry + resolveRoleAccount.
-- Flag REVENUE_RECOGNITION_POST_ENABLED already seeded default OFF — enrolled as per-entity posting
-- flag in apps/backend (POSTING_FLAG_KEYS). TRK excluded in poster (42000-LEASE).
-- Numbered 202609290000 — strictly above prod ledger max 202609280000 (GUARD-verified 2026-07-27).
-- Idempotent / fresh-DB-safe / void-not-delete.
--
-- CANONICAL-CHECK: load_revenue_recognition_latch. accounting.load_revenue_recognition_postings is a
-- LINKAGE / idempotency latch (load → earn/bill JE), NOT a money ledger and NOT deferred-revenue
-- schedule. It stores NO debit/credit balance: money lives only in accounting.journal_entries written
-- by createJournalEntry. Distinct from accounting.invoices / invoice AR posting (bill-first path).
-- Mirrors accounting.parts_purchase_postings / civil_fine_postings.

BEGIN;

-- ===========================================================================================
-- §1 — Linkage latch (NOT a money ledger). One active row per (opco, load, event).
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('accounting.load_revenue_recognition_postings') IS NOT NULL THEN
    RAISE NOTICE 'DISP-01: load_revenue_recognition_postings already exists — skip CREATE';
    RETURN;
  END IF;

  CREATE TABLE accounting.load_revenue_recognition_postings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id uuid NOT NULL REFERENCES org.companies(id),
    load_id uuid NOT NULL REFERENCES mdata.loads(id),
    event text NOT NULL
      CONSTRAINT load_revenue_recognition_postings_event_check
        CHECK (event = ANY (ARRAY['earn'::text, 'bill'::text])),
    journal_entry_id uuid NOT NULL REFERENCES accounting.journal_entries(id),
    amount_cents bigint NOT NULL
      CONSTRAINT load_revenue_recognition_postings_amount_check CHECK (amount_cents > 0),
    entry_date date NOT NULL,
    memo text NOT NULL,
    status text NOT NULL DEFAULT 'posted'
      CONSTRAINT load_revenue_recognition_postings_status_check
        CHECK (status = ANY (ARRAY['posted'::text, 'voided'::text])),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES identity.users(id),
    voided_at timestamptz,
    voided_by_user_id uuid REFERENCES identity.users(id)
  );

  COMMENT ON TABLE accounting.load_revenue_recognition_postings IS
    'DISP-01 linkage latch: load → earn/bill JE. Money lives only in journal_entries. NOT a deferred-revenue schedule.';

  CREATE UNIQUE INDEX load_revenue_recognition_postings_active_uq
    ON accounting.load_revenue_recognition_postings (operating_company_id, load_id, event)
    WHERE is_active;

  CREATE INDEX load_revenue_recognition_postings_je_idx
    ON accounting.load_revenue_recognition_postings (journal_entry_id);

  CREATE INDEX load_revenue_recognition_postings_load_idx
    ON accounting.load_revenue_recognition_postings (operating_company_id, load_id);

  ALTER TABLE accounting.load_revenue_recognition_postings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.load_revenue_recognition_postings FORCE ROW LEVEL SECURITY;

  CREATE POLICY load_revenue_recognition_postings_tenant_isolation
    ON accounting.load_revenue_recognition_postings
    FOR ALL
    USING (
      operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    WITH CHECK (
      operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
      OR current_setting('app.bypass_rls', true) = 'lucia'
    );

  GRANT SELECT, INSERT, UPDATE ON accounting.load_revenue_recognition_postings TO ih35_app;
  REVOKE DELETE ON accounting.load_revenue_recognition_postings FROM ih35_app;
  REVOKE ALL ON accounting.load_revenue_recognition_postings FROM PUBLIC;
END
$$;

-- ===========================================================================================
-- §2 — CoA role CHECK widen (TRUE SUPERSET of live prod 2026-07-27 + unbilled_revenue).
--      Kept LAST so schema-parity attribution stays honest (4096-char window).
-- ===========================================================================================
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
        'warranty_recovery',
        'fuel_overage_receivable',
        'factor_wire_fee',
        'insurance_expense',
        -- DISP-01
        'unbilled_revenue'
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
          'warranty_recovery',
          'fuel_overage_receivable',
          'factor_wire_fee',
          'insurance_expense',
          'unbilled_revenue'
        ])
      );
  END IF;
END
$$;

-- ===========================================================================================
-- §3 — Designate unbilled_revenue to the ALREADY-SEEDED Unbilled Revenue accounts
--      (TRANSP 1240 / USMCA 1150, system_purpose='unbilled_revenue' from 202607620000).
--      TRK has none — excluded by design. Never invents an account number.
-- ===========================================================================================
DO $$
DECLARE
  rec RECORD;
  v_acct uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'DISP-01: chart_of_accounts_roles absent — skip unbilled bind';
    RETURN;
  END IF;

  FOR rec IN
    SELECT c.id AS company_id, c.code
    FROM org.companies c
    WHERE c.code IN ('TRANSP', 'USMCA')
  LOOP
    SELECT a.id INTO v_acct
    FROM catalogs.accounts a
    WHERE a.operating_company_id = rec.company_id
      AND a.deactivated_at IS NULL
      AND a.system_purpose = 'unbilled_revenue'
    ORDER BY a.account_number
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE NOTICE 'DISP-01: no unbilled_revenue account for % — leave unbound (fail-closed)', rec.code;
      CONTINUE;
    END IF;

    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (rec.company_id, 'unbilled_revenue', v_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  END LOOP;
END
$$;

COMMIT;
