-- 202606300020_ap_control_account_designation.sql
-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] catalogs.accounts + COA role designation.
-- DATA-DESIGNATION ONLY, idempotent, scoped to TRANSP (operating_company_id 91e0bf0a-...).
-- NO posting/GL math, NO new accounts, NO row DELETEs (void-not-delete; designation via is_active flip
-- + deactivated_at). NEVER self-merge — §1.4 financial cluster. Depends on a CPA ruling (confirm QBO-47
-- is the real QuickBooks A/P control) — HOLD until the accountant confirms + Jorge labels.
--
-- ROOT CAUSE (GUARD audit, verified on live Neon prod br-fancy-credit-akjnd07a 2026-06-30): the A/P
-- control is the UNFIXED MIRROR of the A/R control defect that 202606290072 + 202606300010 already fixed.
-- accounting.chart_of_accounts_roles(role='ap_control') for TRANSP points at NATIVE account_number '2000'
-- "Accounts Payable" (qbo_account_id IS NULL), while "QBO-47 Accounts Payable (A/P)" (qbo_account_id='47',
-- account_subtype='AccountsPayable', is_postable, active) — the REAL QuickBooks-linked A/P control — is
-- active but UNDESIGNATED. This is the same defect class as A/R (native 1100 vs QBO-45): if A/P posting is
-- ever enabled against native 2000, the TMS A/P control will NOT tie to QuickBooks' A/P (the $1.22M of
-- open bills lives against QBO-47), and the bill sync will not reconcile.
--
-- VERIFIED MECHANISM: the A/P resolver
-- (apps/backend/src/accounting/coa-roles/resolver.service.ts -> resolveControlRoleAccount('ap_control'),
-- already fail-closed in CONTROL_ROLES — throws ControlAccountDesignationError on != 1 designation) keys on
-- accounting.chart_of_accounts_roles(role='ap_control'), NOT on catalogs.accounts.system_purpose. So the
-- canonical designation below is written to chart_of_accounts_roles, the field the code actually uses.
-- NO code change ships with this migration — the fail-closed code already covers ap_control (#1680).
--
-- FIX (data side, mirrors 202606290072 + 202606300010 exactly):
--   1a. Retire any ACTIVE ap_control mapping for TRANSP that does NOT already point at QBO-47 (this retires
--       the native-2000 mapping). void-not-delete: is_active=false, never DELETE. Idempotent.
--   1b. Designate QBO-47 "Accounts Payable (A/P)" (qbo_account_id='47') as TRANSP's ap_control.
--   2.  Deactivate the native 2000 "Accounts Payable" row (deactivated_at=now()) so QBO-47 is the SOLE
--       active AccountsPayable-subtype control — GUARDED on QBO-47 surviving as an active, postable
--       AccountsPayable control, so we can never strand the entity with zero A/P controls.
--
-- NO A/P posting flag is enabled by this migration. This is designation/cleanup only.
--
-- On a FRESH CI DB (no QBO seed) every statement matches 0 rows -> clean no-op (CI-safe). Re-run is a
-- no-op (role already QBO-47; native 2000 already deactivated_at IS NOT NULL).

BEGIN;

-- 1a. Retire any existing ACTIVE ap_control mapping for TRANSP that does NOT already point at QBO-47.
--     void-not-delete: flip is_active=false, never DELETE. Idempotent: no-op once QBO-47 is the mapping.
--     If QBO-47 is absent (fresh DB), the subquery is NULL and nothing is retired (defensive).
UPDATE accounting.chart_of_accounts_roles car
SET is_active = false,
    updated_at = now()
WHERE car.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND car.role = 'ap_control'
  AND car.is_active = true
  AND car.account_id <> (
    SELECT a.id
    FROM catalogs.accounts a
    WHERE a.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
      AND a.qbo_account_id = '47'
      AND a.deactivated_at IS NULL
    LIMIT 1
  );

-- 1b. Designate QBO-47 as TRANSP's ap_control control account. Idempotent via the partial unique index
--     uq_coa_roles_company_role_active (operating_company_id, role) WHERE is_active = true.
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid, 'ap_control', a.id, true
FROM catalogs.accounts a
WHERE a.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND a.qbo_account_id = '47'
  AND a.deactivated_at IS NULL
  AND a.is_postable = true
  AND a.account_subtype = 'AccountsPayable'
ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;

-- 2. Deactivate the native 2000 "Accounts Payable" row so QBO-47 is the SOLE active AccountsPayable-subtype
--    control. void-not-delete: set deactivated_at, never DELETE; all FK references to 2000 remain valid.
--    GUARDED on QBO-47 surviving as an active, postable AccountsPayable control (never strand zero A/P
--    controls). Fresh CI DB: neither row exists -> guard unsatisfied -> 0 rows -> clean no-op.
UPDATE catalogs.accounts native
SET deactivated_at = now(),
    updated_at = now()
WHERE native.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND native.account_number = '2000'
  AND native.qbo_account_id IS NULL
  AND native.account_name ILIKE 'Accounts Payable'
  AND native.deactivated_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM catalogs.accounts ctrl
    WHERE ctrl.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
      AND ctrl.qbo_account_id = '47'
      AND ctrl.account_subtype = 'AccountsPayable'
      AND ctrl.deactivated_at IS NULL
      AND ctrl.is_postable = true
  );

COMMIT;

-- ROLLBACK (manual; forward-only chain otherwise):
-- BEGIN;
--   -- reactivate native 2000
--   UPDATE catalogs.accounts SET deactivated_at = NULL, updated_at = now()
--     WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
--       AND account_number = '2000' AND qbo_account_id IS NULL
--       AND account_name ILIKE 'Accounts Payable';
--   -- retire the QBO-47 ap_control designation
--   UPDATE accounting.chart_of_accounts_roles SET is_active = false, updated_at = now()
--     WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
--       AND role = 'ap_control' AND is_active = true
--       AND account_id = (SELECT id FROM catalogs.accounts
--                         WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
--                           AND qbo_account_id = '47');
--   -- (optionally re-designate native 2000 as ap_control if reverting fully)
-- COMMIT;
