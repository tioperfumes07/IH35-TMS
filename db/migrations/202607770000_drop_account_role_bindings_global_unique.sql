-- [HOLD-FOR-JORGE — TIER 1 · §1.4 FINANCIAL CLUSTER] Drop the GLOBAL UNIQUE(role_key) on
-- catalogs.account_role_bindings (lane defect C / WO 2026-07-23).
--
-- *** DO NOT RUN ON PROD VIA db:migrate. Apply ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill. Table is 0 rows on prod — DROP is safe. ***
--
-- ROOT CAUSE: account_role_bindings has BOTH:
--   • account_role_bindings_role_key_key UNIQUE(role_key) — GLOBAL — the bug (blocks per-entity)
--   • uq_account_role_bindings_company_role_key UNIQUE(operating_company_id, role_key) — correct
-- Primary designation is accounting.chart_of_accounts_roles; this table is LEGACY/retired fallback.
-- Drop the global unique ONLY. Keep the per-entity unique + CHECK + FKs.

BEGIN;

ALTER TABLE catalogs.account_role_bindings
  DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_key;

COMMIT;

-- POST-DEPLOY:
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'catalogs.account_role_bindings'::regclass AND contype = 'u';
--   -- expect ONLY uq_account_role_bindings_company_role_key (or equivalent per-entity unique index),
--   -- NOT account_role_bindings_role_key_key.
