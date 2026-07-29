-- MONEY WO 2026-07-29 — held posting flags CoA prep + selective enables.
-- AUTO-APPLY via db:migrate on deploy (owner ruling 2026-07-29). No QBO write-back flags.
--
-- Creates/binds:
--   prepaid_asset_default + Prepaid Expenses account (TRK, USMCA)
--   amortization_expense_default + Amortization Expense account (TRK, USMCA)
--   TRK fixed_asset_classes.default_depr_expense_account_id from depr_expense_default
--   USMCA factor_wire_fee → 6300 Bank Service Charges & Wire Fees
-- Enables (NOTICE+skip if unbound):
--   FACTORING_GL_POSTING_ENABLED for TRANSP (roles already complete)
--   FACTORING_GL_POSTING_ENABLED for USMCA only after factor_wire_fee bound
-- Does NOT enable PREPAID/FH3/FA until posters land (sibling work) — accounts+roles only here.
-- NEVER touches QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED.
-- Rule 19: never create/reclassify reserve accounts.

BEGIN;

-- Widen role CHECK to include new roles (TRUE SUPERSET of live + new).
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
        'unbilled_revenue',
        'fixed_asset_default',
        'accum_depr_default',
        'depr_expense_default',
        'heavy_repair_expense',
        'prepaid_asset_default',
        'amortization_expense_default'
      ));
  END IF;
END $$;

-- Prepaid Expenses asset (TRK + USMCA) — one generic account per entity.
INSERT INTO catalogs.accounts (
  operating_company_id, account_number, account_name, account_type, account_subtype,
  system_purpose, is_postable, currency_code, is_locked, is_billable_expense
)
SELECT
  c.id, '1410', 'Prepaid Expenses', 'Asset', 'PrepaidExpenses',
  'prepaid_asset_default', true, 'USD', false, false
FROM org.companies c
WHERE c.code IN ('TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (
        a.system_purpose = 'prepaid_asset_default'
        OR (a.account_number = '1410' AND a.account_name = 'Prepaid Expenses')
      )
  );

-- Amortization Expense (TRK + USMCA)
INSERT INTO catalogs.accounts (
  operating_company_id, account_number, account_name, account_type, account_subtype,
  system_purpose, is_postable, currency_code, is_locked, is_billable_expense
)
SELECT
  c.id, '6850', 'Amortization Expense', 'OtherExpense', 'Amortization',
  'amortization_expense_default', true, 'USD', false, false
FROM org.companies c
WHERE c.code IN ('TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (
        a.system_purpose = 'amortization_expense_default'
        OR (a.account_number = '6850' AND a.account_name = 'Amortization Expense')
      )
  );

-- Bind prepaid_asset_default
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT c.id, 'prepaid_asset_default', a.id, true
FROM org.companies c
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.deactivated_at IS NULL
 AND (a.system_purpose = 'prepaid_asset_default' OR (a.account_number = '1410' AND a.account_name = 'Prepaid Expenses'))
WHERE c.code IN ('TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
    WHERE r.operating_company_id = c.id AND r.role = 'prepaid_asset_default' AND r.is_active
  );

-- Bind amortization_expense_default
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT c.id, 'amortization_expense_default', a.id, true
FROM org.companies c
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.deactivated_at IS NULL
 AND (a.system_purpose = 'amortization_expense_default' OR (a.account_number = '6850' AND a.account_name = 'Amortization Expense'))
WHERE c.code IN ('TRK', 'USMCA')
  AND NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
    WHERE r.operating_company_id = c.id AND r.role = 'amortization_expense_default' AND r.is_active
  );

-- TRK truck-class defaults: depreciation expense from depr_expense_default, cost basis from
-- fixed_asset_default. Accumulated depreciation stays NULL on the class ON PURPOSE — TRK carries
-- 187 per-unit Accumulated Depreciation accounts, so the register resolves that leg per unit
-- (owned-unit-fixed-asset-register.service.ts) rather than collapsing every truck onto one account.
--
-- TRUCK CLASS ONLY. The bound role account is 'Truck Depreciation' (QBO-1150040035); pushing it
-- onto the trailer/reefer/car classes would book trailer depreciation into the truck expense
-- account. Those classes get their own roles when the owner creates them.
UPDATE accounting.fixed_asset_classes fac
SET default_depr_expense_account_id = r.account_id,
    updated_at = now()
FROM accounting.chart_of_accounts_roles r
JOIN org.companies c ON c.id = r.operating_company_id
JOIN catalogs.accounts a ON a.id = r.account_id AND a.deactivated_at IS NULL AND a.is_postable
WHERE fac.operating_company_id = c.id
  AND c.code = 'TRK'
  AND r.role = 'depr_expense_default'
  AND r.is_active
  AND fac.default_depr_expense_account_id IS NULL
  AND fac.deleted_at IS NULL
  AND lower(fac.class_code) = 'truck';

UPDATE accounting.fixed_asset_classes fac
SET default_asset_account_id = r.account_id,
    updated_at = now()
FROM accounting.chart_of_accounts_roles r
JOIN org.companies c ON c.id = r.operating_company_id
JOIN catalogs.accounts a ON a.id = r.account_id AND a.deactivated_at IS NULL AND a.is_postable
WHERE fac.operating_company_id = c.id
  AND c.code = 'TRK'
  AND r.role = 'fixed_asset_default'
  AND r.is_active
  AND fac.default_asset_account_id IS NULL
  AND fac.deleted_at IS NULL
  AND lower(fac.class_code) = 'truck';

-- USMCA factor_wire_fee → 6300 Bank Service Charges & Wire Fees (Expense, postable, active —
-- read live 2026-07-28 on br-fancy-credit-akjnd07a with app.bypass_rls='lucia').
--
-- Pinned to the account NUMBER, not an ILIKE shape. A '%wire%fee%' fallback picks whichever row
-- happens to sort first, so a rename or a new lookalike account would silently re-point a GL leg.
-- If 6300 is ever missing or unpostable this inserts nothing, factor_wire_fee stays unbound, and
-- the enable block below NOTICE-skips USMCA — the safe outcome, not a guessed binding.
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT c.id, 'factor_wire_fee', a.id, true
FROM org.companies c
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.deactivated_at IS NULL
 AND a.is_postable
 AND a.account_type = 'Expense'
 AND a.account_number = '6300'
WHERE c.code = 'USMCA'
  AND NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
    WHERE r.operating_company_id = c.id AND r.role = 'factor_wire_fee' AND r.is_active
  );

-- Enable FACTORING_GL_POSTING for TRANSP + USMCA (NOTICE skip if suite incomplete). TRK never.
DO $$
DECLARE
  v_co uuid;
  v_code text;
  v_setter uuid;
  v_role text;
  -- Every role factoring-posting/poster.service.ts puts on a JE leg: advance, reserve release,
  -- chargeback + default interest, fees. Arming the flag with any of these unbound means the first
  -- real Faro event resolves NULL for a leg. ar_assigned_to_factor is deliberately NOT required —
  -- the poster documents it as the optional assigned-A/R treatment, not a leg on the default path.
  v_required text[] := ARRAY[
    'factoring_advance_liability','factoring_recoursed_ar',
    'factor_reserve_held','factor_fee_expense','factor_wire_fee',
    'default_interest_expense','ar_control','cash_clearing'
  ];
  v_ok boolean;
BEGIN
  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC LIMIT 1;
  IF v_setter IS NULL THEN
    RAISE NOTICE 'HELD-FLAGS: no setter — skipping factoring enables';
    RETURN;
  END IF;

  FOR v_co, v_code IN
    SELECT id, code FROM org.companies WHERE code IN ('TRANSP', 'USMCA')
  LOOP
    v_ok := true;
    FOREACH v_role IN ARRAY v_required LOOP
      IF NOT EXISTS (
        SELECT 1 FROM accounting.chart_of_accounts_roles
         WHERE operating_company_id = v_co AND role = v_role AND is_active
      ) THEN
        RAISE NOTICE 'HELD-FLAGS: % missing role % — not enabling FACTORING_GL_POSTING', v_code, v_role;
        v_ok := false;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_ok THEN CONTINUE; END IF;

    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES
      (gen_random_uuid(), 'FACTORING_GL_POSTING_ENABLED', v_co, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
    RAISE NOTICE 'HELD-FLAGS: FACTORING_GL_POSTING_ENABLED ON for %', v_code;
  END LOOP;
END $$;

-- Owner ruling 2026-07-29: TRK does not factor (asset holder / lessor only).
-- Prod currently has active embezzlement-era factoring role bindings — deactivate (void-not-delete).
-- Never DELETE. Never enable FACTORING_GL_POSTING for TRK.
DO $$
DECLARE
  v_trk uuid;
BEGIN
  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' LIMIT 1;
  IF v_trk IS NULL THEN
    RAISE NOTICE 'HELD-FLAGS: TRK absent — skip factoring role deactivation';
    RETURN;
  END IF;

  UPDATE accounting.chart_of_accounts_roles
     SET is_active = false
   WHERE operating_company_id = v_trk
     AND is_active = true
     AND role IN (
       'factor_reserve_default',
       'factor_wire_fee',
       'factor_fee_expense',
       'factor_reserve_held',
       'factoring_advance_liability',
       'ar_assigned_to_factor',
       'factoring_recoursed_ar',
       'default_interest_expense'
     );

  -- Ensure flag stays OFF for TRK if an override row exists
  UPDATE lib.feature_flag_overrides
     SET enabled = false, set_at = now()
   WHERE flag_key = 'FACTORING_GL_POSTING_ENABLED'
     AND operating_company_id = v_trk
     AND user_uuid IS NULL
     AND enabled IS DISTINCT FROM false;

  RAISE NOTICE 'HELD-FLAGS: deactivated TRK factoring CoA role bindings; FACTORING flag forced OFF';
END $$;

COMMIT;
