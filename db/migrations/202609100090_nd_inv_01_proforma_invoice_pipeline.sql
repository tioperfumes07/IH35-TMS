-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] ND-INV-01 — proforma invoice pipeline (stage 1)
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. ***
-- Pro Forma is NON-POSTING (status=proforma). Official invoice posts A/R only after POD convert.
-- Broker/customer advance liability role admits designation; poster reuse only (no new GL math).
-- Cursor band 20260910xxxx. Idempotent / fresh-DB-safe.
--
-- 2026-07-31 PROD APPLY NOTE: Neon already applied with RESET ROLE (session was forced to ih35_app).
-- CoA CHECK must be TRUE SUPERSET of live prod — includes heavy_repair_expense,
-- prepaid_asset_default, amortization_expense_default (were missing in first held file).

BEGIN;

-- §1 — Admit proforma status (non-posting draft for projections)
DO $$
BEGIN
  IF to_regclass('accounting.invoices') IS NULL THEN
    RAISE NOTICE 'ND-INV-01: accounting.invoices absent — skip status CHECK';
    RETURN;
  END IF;
  ALTER TABLE accounting.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
  ALTER TABLE accounting.invoices
    ADD CONSTRAINT invoices_status_check
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'proforma'::text,
      'sent'::text,
      'partial'::text,
      'paid'::text,
      'void'::text,
      'factored'::text
    ]));
END
$$;

COMMENT ON CONSTRAINT invoices_status_check ON accounting.invoices IS
  'ND-INV-01: proforma = non-posting projection invoice created at book; convert to draft/sent at POD before A/R.';

-- §2 — Advance application tracking on the invoice (net = freight − advances)
DO $$
BEGIN
  IF to_regclass('accounting.invoices') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE accounting.invoices
    ADD COLUMN IF NOT EXISTS broker_advance_applied_cents bigint NOT NULL DEFAULT 0
    CONSTRAINT invoices_broker_advance_applied_cents_check CHECK (broker_advance_applied_cents >= 0);
  COMMENT ON COLUMN accounting.invoices.broker_advance_applied_cents IS
    'ND-INV-01: sum of broker/customer advances applied to this (proforma→official) invoice, in cents.';
END
$$;

-- §3 — CoA role for Broker/Customer Advance liability (TRUE SUPERSET of live prod)
DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'ND-INV-01: chart_of_accounts_roles absent — skip role CHECK';
    RETURN;
  END IF;
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
      'unbilled_revenue',
      'fixed_asset_default','accum_depr_default','depr_expense_default',
      -- LIVE on prod before ND-INV-01 (must keep — first held file omitted these)
      'heavy_repair_expense','prepaid_asset_default','amortization_expense_default',
      -- ND-INV-01
      'broker_customer_advance_liability',
      -- LEASE-BRIDGE live on prod 2026-07-31 (must keep)
      'rent_expense'
    ));
END
$$;

-- §4 — Feature flag (default OFF until owner Neon-apply + gate)
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
  VALUES (
    'INVOICE_PROFORMA_PIPELINE_ENABLED',
    'ND-INV-01: auto-create proforma at book; convert to official invoice at POD. Default OFF until owner Neon-apply + per-entity enable.',
    false
  )
  ON CONFLICT (flag_key) DO NOTHING;
END
$$;

COMMIT;
