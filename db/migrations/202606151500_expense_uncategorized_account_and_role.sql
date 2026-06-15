-- GAP-EXPENSES Phase 2 — Step 2 (safe foundation, NO posting logic):
-- seed the "Uncategorized Expenses" account + per-company uncategorized_expense role,
-- so Phase-2 posting (behind EXPENSE_GL_POSTING_ENABLED, default OFF) can resolve a GL
-- account for un-categorized / direct expenses (decision #1).
--
-- VERIFIED (real code + prod-mirror):
--   - catalogs.accounts is the GL posting CoA (journal_entry_postings.account_id +
--     chart_of_accounts_roles.account_id both FK it). It is GLOBAL (no tenant column);
--     per-company-ness is via chart_of_accounts_roles. accounting.coa_account is the QBO mirror.
--   - chart_of_accounts_roles unique key = PARTIAL index uq_coa_roles_company_role_active
--     (operating_company_id, role) WHERE is_active = true → the ON CONFLICT carries that predicate.
--   - role CHECK currently lists 11 roles (incl. expense_default), no uncategorized_expense → widen it.
-- account_number 6999 (Jorge). Additive, idempotent, rollback below. Changes NO behavior on its own.

BEGIN;

-- 1. Widen the role CHECK to allow uncategorized_expense (idempotent: drop + re-add full list).
ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role IN (
    'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
    'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
    'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense'
  ));

-- 2. One global "Uncategorized Expenses" account (#6999, Expense, postable) in catalogs.accounts, if absent.
INSERT INTO catalogs.accounts (account_number, account_name, account_type, is_postable)
SELECT '6999', 'Uncategorized Expenses', 'Expense', true
WHERE NOT EXISTS (
  SELECT 1 FROM catalogs.accounts
  WHERE account_name = 'Uncategorized Expenses' AND account_type = 'Expense'
);

-- 3. Per-company uncategorized_expense role → that account, for each ACTIVE company (mirrors ap_control).
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT c.id, 'uncategorized_expense', a.id, true
FROM org.companies c
CROSS JOIN LATERAL (
  SELECT id FROM catalogs.accounts
  WHERE account_name = 'Uncategorized Expenses' AND account_type = 'Expense'
  LIMIT 1
) a
WHERE c.is_active
ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;

COMMIT;

-- ROLLBACK (additive; run manually if needed — forward-only chain otherwise):
-- BEGIN;
--   DELETE FROM accounting.chart_of_accounts_roles WHERE role = 'uncategorized_expense';
--   DELETE FROM catalogs.accounts a
--     WHERE a.account_name = 'Uncategorized Expenses' AND a.account_type = 'Expense'
--       AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.account_id = a.id)
--       AND NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r WHERE r.account_id = a.id);
--   -- (re-narrow the CHECK to the original 11 roles only if no row uses 'uncategorized_expense')
-- COMMIT;
