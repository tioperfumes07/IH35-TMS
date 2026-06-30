-- 202606300010_deactivate_native_1100_ar.sql
-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] catalogs.accounts data-designation only. NEVER self-merge (§1.4).
-- DATA ONLY, idempotent, scoped to TRANSP (operating_company_id 91e0bf0a-...). NO posting/GL math,
-- NO new accounts, NO row DELETEs.
--
-- OWNER DECISION (ACCOUNTING-1, locked 2026-06-30): native account 1100 "Accounts Receivable"
-- (account_number='1100', qbo_account_id IS NULL) and QBO-45 "Accounts Receivable (A/R)"
-- (qbo_account_id='45') are a DUPLICATE A/R pair. Migration 202606290072 already designated QBO-45 as
-- THE AccountsReceivable-subtype control (accounting.chart_of_accounts_roles role='ar_control') and
-- reclassified the 2 mis-classified advances off the AccountsReceivable subtype. This migration
-- completes the cleanup by DEACTIVATING the native 1100 row so QBO-45 is the SOLE active
-- AccountsReceivable-subtype control account for TRANSP.
--
-- VOID-NOT-DELETE: catalogs.accounts has NO is_active column. The deactivation mechanism (verified
-- against the 0010_catalogs_init.sql CREATE TABLE and used as the active filter by both
-- coa-roles/resolver.service.ts and migration 202606290072) is the `deactivated_at timestamptz` column —
-- deactivated_at IS NULL == active. We set deactivated_at = now(); we never DELETE. All FK references to
-- the 1100 id remain valid, preserving history.
--
-- SAFETY GUARD: 1100 is retired ONLY while QBO-45 survives as an active, postable
-- AccountsReceivable-subtype account for TRANSP — so we can never strand the entity with zero A/R
-- controls. On a FRESH CI DB (no QBO seed) neither row exists, the guard is unsatisfied, and the
-- statement matches 0 rows -> clean no-op (CI-safe). Idempotent: re-running matches 0 rows because
-- deactivated_at is no longer NULL.

BEGIN;

UPDATE catalogs.accounts native
SET deactivated_at = now(),
    updated_at = now()
WHERE native.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND native.account_number = '1100'
  AND native.qbo_account_id IS NULL
  AND native.account_name ILIKE 'Accounts Receivable'
  AND native.deactivated_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM catalogs.accounts ctrl
    WHERE ctrl.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
      AND ctrl.qbo_account_id = '45'
      AND ctrl.account_subtype = 'AccountsReceivable'
      AND ctrl.deactivated_at IS NULL
      AND ctrl.is_postable = true
  );

COMMIT;

-- ROLLBACK (manual; forward-only chain otherwise) — reactivate native 1100:
-- BEGIN;
--   UPDATE catalogs.accounts
--     SET deactivated_at = NULL, updated_at = now()
--   WHERE operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
--     AND account_number = '1100'
--     AND qbo_account_id IS NULL
--     AND account_name ILIKE 'Accounts Receivable';
-- COMMIT;
