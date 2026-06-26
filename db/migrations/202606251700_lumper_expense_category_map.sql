-- [HOLD-FOR-JORGE — TIER 1] Lumper Lifecycle STEP 3a: add the 'lumper' expense category + GL account map.
--
-- Lumper is a pass-through / reimbursable ACCESSORIAL (IRS / 49 USC 14103), booked the QuickBooks-native
-- billed-passthrough way: cost to COGS, income offsets to ~0 when billed to the customer (S2). Maps the new
-- 'lumper' category to the TWO EXISTING QBO-synced accounts (Jorge-approved; accounts already exist, do NOT
-- create; QBO-13 "Reimbursable Expenses" is DELETED, never used):
--   DR (we paid the lumper)           -> QBO-117          "Warehouse-Lumper Fee"            (Expense / COGS)
--   CR (customer reimburses, S2 only) -> QBO-1150040160   "Sales-Warehouse-Lumper Fee-Income" (Income)
--
-- Accounts resolved by account_number PER ENTITY (catalogs.accounts is entity-scoped; no hardcoded uuids,
-- no global rows — MULTI-ENTITY-SEPARATION). The map's partial unique index is
-- (operating_company_id, category_kind, category_code) WHERE is_active — so the DR and CR rows use distinct
-- category_codes ('lumper' for the expense, 'lumper_reimbursement_income' for the income side). Additive,
-- idempotent (ON CONFLICT DO NOTHING). Behind LUMPER_LIFECYCLE_ENABLED at the application layer; this seed is
-- inert until the posting engine reads it.

-- (1) Extend the category_kind CHECK to allow 'lumper' (drop + re-add the full list; idempotent).
ALTER TABLE accounting.expense_category_account_map
  DROP CONSTRAINT IF EXISTS expense_category_account_map_category_kind_check;
ALTER TABLE accounting.expense_category_account_map
  ADD CONSTRAINT expense_category_account_map_category_kind_check
  CHECK (category_kind = ANY (ARRAY[
    'fuel','maintenance','revenue','driver_pay','factoring_fee','toll','escrow',
    'insurance','office','other','cash_advance','lumper'
  ]));

-- (2) Seed the lumper category->account map PER ENTITY that has BOTH accounts (resolved by account_number).
-- REPLAY-SAFE: QBO-117 / QBO-1150040160 are QBO-SYNCED runtime data in catalogs.accounts, NOT created by any
-- migration — so a fresh-DB build (CI / a brand-new tenant) legitimately has neither yet. The JOIN below
-- therefore seeds nothing for an entity that lacks the accounts; it does NOT raise (a missing QBO account on
-- a fresh DB is not an error, and a RAISE here breaks fresh-DB migration replay — §2). The fail-loud lives at
-- RUNTIME instead: the STEP 3b split engine returns 'lumper_expense_account_missing' if QBO-117 is absent when
-- it actually tries to post. On prod (accounts present) TRANSP gets both map rows; GUARD verifies that.
INSERT INTO accounting.expense_category_account_map
  (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
SELECT c.id, 'lumper', v.category_code, a.id, v.posting_side, true
FROM org.companies c
JOIN (VALUES
  ('lumper',                       'QBO-117',        'debit'),   -- DR lumper expense (COGS)
  ('lumper_reimbursement_income',  'QBO-1150040160', 'credit')   -- CR lumper reimbursement income (S2 invoice)
) AS v(category_code, acct_num, posting_side) ON true
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.account_number = v.acct_num
 AND a.deactivated_at IS NULL
WHERE c.is_active = true
  AND c.deactivated_at IS NULL
ON CONFLICT DO NOTHING;
