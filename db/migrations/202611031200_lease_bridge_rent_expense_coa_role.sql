-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] LEASE-BRIDGE — lessee rent_expense CoA role (ASC 842 operating).
--
-- *** DO NOT RUN ON PROD via db:migrate until owner Neon-applies. POSTS NOTHING by itself. ***
--
-- ROOT CAUSE: FIN-22 posts TRK lessor rental income (rental_income) but TRANSP/USMCA have no
--   designated rent_expense control role, so activate-time lessee operating JEs cannot resolve.
--
-- FIX: widen chart_of_accounts_roles CHECK with rent_expense (TRUE SUPERSET of live Neon 2026-07-31
--   lucia CHECK including prepaid/amortization); soft-bind TRANSP/USMCA to existing
--   "Leased Trucks from IH35 TRUCKING" when present; seed that account for USMCA only if missing
--   (additive; never invent purchase prices / fixed_assets). DELIBERATELY no ROLE_FALLBACKS.
-- NEVER touches QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED (parallel books stay OFF).
-- Rule 19: never create/reclassify reserve accounts.

BEGIN;

-- §1 — Widen role CHECK (TRUE SUPERSET of live Neon + rent_expense).
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
        'amortization_expense_default',
        'rent_expense'
      ));
  END IF;
END $$;

-- §2 — USMCA: additive seed of intercompany truck rent expense if missing (TRANSP already has it).
INSERT INTO catalogs.accounts (
  operating_company_id,
  account_number,
  account_name,
  account_type,
  account_subtype,
  system_purpose,
  is_postable,
  currency_code,
  is_locked,
  is_billable_expense
)
SELECT
  c.id,
  'QBO-228-USMCA',
  'Leased Trucks from IH35 TRUCKING',
  'CostOfGoodsSold',
  'CostOfLabor',
  'rent_expense',
  true,
  'USD',
  false,
  false
FROM org.companies c
WHERE c.code = 'USMCA'
  AND NOT EXISTS (
    SELECT 1
    FROM catalogs.accounts a
    WHERE a.operating_company_id = c.id
      AND a.deactivated_at IS NULL
      AND (
        a.system_purpose = 'rent_expense'
        OR a.account_name = 'Leased Trucks from IH35 TRUCKING'
      )
  );

-- §3 — Soft-bind rent_expense for TRANSP + USMCA (exact name / system_purpose). Fail closed if absent.
DO $$
DECLARE
  rec RECORD;
  v_acct uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'LEASE-BRIDGE: chart_of_accounts_roles absent — skip rent_expense bind';
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
      AND (
        a.system_purpose = 'rent_expense'
        OR a.account_name = 'Leased Trucks from IH35 TRUCKING'
      )
    ORDER BY CASE WHEN a.system_purpose = 'rent_expense' THEN 0 ELSE 1 END
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE NOTICE 'LEASE-BRIDGE: % missing Leased Trucks from IH35 TRUCKING — leave rent_expense unbound', rec.code;
      CONTINUE;
    END IF;

    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (rec.company_id, 'rent_expense', v_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id,
          updated_at = now();
  END LOOP;
END
$$;

COMMIT;
