-- B1 — Driver Inbox money-linkage: populate accounting.expense_category_account_map
-- and ADD the 'cash_advance' category. Makes the posting resolver functional; the table
-- has been EMPTY since migration 0218. Until seeded, every approval booked a deduction
-- but NEVER posted to the books.
--
-- (A) CHECK-extend pattern copied from migration 0221 (named DROP + ADD CONSTRAINT),
--     preserving ALL existing category_kind values (incl. 'revenue' added by 0221) and
--     ADDING 'cash_advance'.
-- (B) Seed = active operating companies (TRANSP + TRK; USMCA is inactive) CROSS JOIN the
--     10 category -> account mappings. category_code = category_kind (1:1). posting_side
--     is 'debit' for all except 'escrow' (liability) -> 'credit'. Idempotent via
--     ON CONFLICT DO NOTHING; each account guarded with EXISTS against catalogs.accounts
--     (pattern copied from db/migrations/202606080937_coa_role_bindings_seed.sql).
-- (C) GRANTS to ih35_app only. RLS + company-scope policy + updated_at trigger already
--     established in 0218 (not re-added here).
--
-- Account UUIDs resolved from catalogs.accounts (canonical CoA) on 2026-06-13:
--   cash_advance  6a46bfea-4020-46ea-9f3c-99bab3cc06f5  QBO-149         Driver Cash Advance
--   maintenance   27c4a09a-0d34-4908-9da1-44b6174b5bce  QBO-1150040031  Repair & Maintenance Expenses
--   fuel          58c6e304-ab3e-4714-9c35-623ec51ae7cf  6100            Fuel Expense
--   toll          7d795152-0883-41ef-80ee-91de1f97f9bb  QBO-38          OTR-Bridge & Toll Expenses
--   driver_pay    4aa75ca4-859b-4721-bea4-947a98f2171d  QBO-48          COL-Line Haul Driver Payment
--   factoring_fee ad466f4d-322b-4319-abec-00ac45f9fefd  QBO-1150040129  Bank-Finance-Factoring Expenses
--   escrow        d7d485bf-ad1a-4573-9ad6-badbd565e9a3  QBO-1150040187  Damage Claim Escrow (PARENT; per-driver sub-acct is B9)
--   insurance     fdfacf6c-5c60-4b60-a55d-84c88a497e59  QBO-7           Vehicle Insurance Expenses
--   office        2e482459-e722-439d-a444-6f700d42414e  QBO-12          Office/General/ Administrative Expenses-635
--   other         4cec8ed2-4dbc-4765-8a59-ace3ce45a7d7  QBO-25          Uncategorized Expense

BEGIN;

-- (A) Extend the category_kind CHECK: add 'cash_advance', preserve every existing value.
ALTER TABLE accounting.expense_category_account_map
  DROP CONSTRAINT IF EXISTS expense_category_account_map_category_kind_check;

ALTER TABLE accounting.expense_category_account_map
  ADD CONSTRAINT expense_category_account_map_category_kind_check
  CHECK (
    category_kind IN (
      'fuel',
      'maintenance',
      'revenue',
      'driver_pay',
      'factoring_fee',
      'toll',
      'escrow',
      'insurance',
      'office',
      'other',
      'cash_advance'
    )
  );

-- (B) Seed the map for active operating companies x the 10 mappings.
INSERT INTO accounting.expense_category_account_map (
  operating_company_id,
  category_kind,
  category_code,
  account_id,
  posting_side,
  is_active
)
SELECT
  c.id,
  m.category_kind,
  m.category_kind AS category_code,
  m.account_id::uuid,
  m.posting_side,
  true
FROM org.companies c
CROSS JOIN (
  VALUES
    ('cash_advance',  '6a46bfea-4020-46ea-9f3c-99bab3cc06f5', 'debit'),
    ('maintenance',   '27c4a09a-0d34-4908-9da1-44b6174b5bce', 'debit'),
    ('fuel',          '58c6e304-ab3e-4714-9c35-623ec51ae7cf', 'debit'),
    ('toll',          '7d795152-0883-41ef-80ee-91de1f97f9bb', 'debit'),
    ('driver_pay',    '4aa75ca4-859b-4721-bea4-947a98f2171d', 'debit'),
    ('factoring_fee', 'ad466f4d-322b-4319-abec-00ac45f9fefd', 'debit'),
    ('escrow',        'd7d485bf-ad1a-4573-9ad6-badbd565e9a3', 'credit'),
    ('insurance',     'fdfacf6c-5c60-4b60-a55d-84c88a497e59', 'debit'),
    ('office',        '2e482459-e722-439d-a444-6f700d42414e', 'debit'),
    ('other',         '4cec8ed2-4dbc-4765-8a59-ace3ce45a7d7', 'debit')
) AS m(category_kind, account_id, posting_side)
WHERE c.is_active = true
  AND c.deactivated_at IS NULL
  AND EXISTS (
    SELECT 1 FROM catalogs.accounts a WHERE a.id = m.account_id::uuid
  )
ON CONFLICT DO NOTHING;

-- (C) Grants: ih35_app only (idempotent; matches 0218).
GRANT SELECT, INSERT, UPDATE ON accounting.expense_category_account_map TO ih35_app;

-- Drift-capture signal: expect 20 rows on live (2 active companies x 10 mappings);
-- 0 on an empty CI reset DB (no companies/accounts seeded there) — both are valid.
SELECT count(*) AS expense_category_account_map_seeded
FROM accounting.expense_category_account_map
WHERE is_active = true;

COMMIT;
