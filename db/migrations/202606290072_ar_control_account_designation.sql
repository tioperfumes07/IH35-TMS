-- 202606290070_ar_control_account_designation.sql
-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] catalogs.accounts + COA role designation.
-- DATA-DESIGNATION ONLY, idempotent, scoped to TRANSP (operating_company_id 91e0bf0a-...).
-- NO posting/GL math, NO new accounts, NO row DELETEs (void-not-delete; designation via is_active flip
-- + account_subtype reclassification). NEVER self-merge — §1.4 financial cluster.
--
-- ROOT CAUSE (GUARD audit Module 15, verified on live Neon): the invoice A/R-debit resolver
-- (apps/backend/src/accounting/coa-roles/resolver.service.ts -> resolveRoleAccountOptional("ar_control"),
-- consumed by posting-engine.service.ts buildInvoiceLines) had NO explicit ar_control designation for
-- TRANSP, so it fell through to the account_subtype fallback. FOUR TRANSP accounts carry
-- account_subtype='AccountsReceivable' (all system_purpose NULL), so the resolver had no tiebreaker and
-- could debit A/R to the WRONG account — observed: "Unauthorized Expenses Ignacio Muñoz", an employee
-- advance, NOT real A/R.
--
-- VERIFIED MECHANISM: the resolver keys on accounting.chart_of_accounts_roles(role='ar_control'),
-- NOT on catalogs.accounts.system_purpose (the runtime resolver never reads system_purpose). So the
-- canonical designation below is written to chart_of_accounts_roles, the field the code actually uses.
--
-- FIX (data side; the matching FAIL-CLOSED code change lives in resolver.service.ts — control roles now
-- throw ControlAccountDesignationError instead of silently picking one of many subtype matches):
--   1. Designate QBO-45 "Accounts Receivable (A/R)" (qbo_account_id='45' — the REAL QBO A/R control)
--      as TRANSP's ar_control in accounting.chart_of_accounts_roles.
--   2. Reclassify the 2 MIS-CLASSIFIED employee/related-party advances
--      (qbo_account_id IN '1150040132','1150040133' — "Unauthorized Expenses ...") OFF
--      account_subtype='AccountsReceivable' -> 'OtherCurrentAssets', so they can NEVER be picked as A/R.
--
-- OWNER DECISION — OUT OF SCOPE, do NOT action here: account_number 1100 "Accounts Receivable"
-- (native, qbo_account_id NULL) and QBO-45 "Accounts Receivable (A/R)" (qbo_account_id='45') are a
-- DUPLICATE A/R pair. This migration designates QBO-45 as THE control account but deliberately does NOT
-- deactivate/merge 1100 — deactivation is owner-only (§1.6). Jorge to later decide whether to
-- merge/deactivate 1100.
--
-- On a FRESH CI DB (no QBO seed) every statement below matches 0 rows -> clean no-op (CI-safe).

BEGIN;

-- 1a. Retire any existing ACTIVE ar_control mapping for TRANSP that does NOT already point at QBO-45.
--     void-not-delete: flip is_active=false, never DELETE. Idempotent: no-op once QBO-45 is the mapping.
--     If QBO-45 is absent (fresh DB), the subquery is NULL and nothing is retired (defensive).
UPDATE accounting.chart_of_accounts_roles car
SET is_active = false,
    updated_at = now()
WHERE car.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND car.role = 'ar_control'
  AND car.is_active = true
  AND car.account_id <> (
    SELECT a.id
    FROM catalogs.accounts a
    WHERE a.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
      AND a.qbo_account_id = '45'
      AND a.deactivated_at IS NULL
    LIMIT 1
  );

-- 1b. Designate QBO-45 as TRANSP's ar_control control account. Idempotent via the partial unique index
--     uq_coa_roles_company_role_active (operating_company_id, role) WHERE is_active = true.
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid, 'ar_control', a.id, true
FROM catalogs.accounts a
WHERE a.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND a.qbo_account_id = '45'
  AND a.deactivated_at IS NULL
  AND a.is_postable = true
ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;

-- 2. Reclassify the 2 mis-classified employee/related-party advances OFF AccountsReceivable so the
--    account_subtype fallback can NEVER select them as A/R. Idempotent (re-run matches 0 rows).
UPDATE catalogs.accounts
SET account_subtype = 'OtherCurrentAssets',
    updated_at = now()
WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND qbo_account_id IN ('1150040132', '1150040133')
  AND account_subtype = 'AccountsReceivable';

COMMIT;

-- ROLLBACK (manual; forward-only chain otherwise):
-- BEGIN;
--   UPDATE catalogs.accounts SET account_subtype = 'AccountsReceivable', updated_at = now()
--     WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
--       AND qbo_account_id IN ('1150040132','1150040133') AND account_subtype = 'OtherCurrentAssets';
--   UPDATE accounting.chart_of_accounts_roles SET is_active = false, updated_at = now()
--     WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
--       AND role = 'ar_control' AND is_active = true
--       AND account_id = (SELECT id FROM catalogs.accounts
--                         WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
--                           AND qbo_account_id = '45');
-- COMMIT;
