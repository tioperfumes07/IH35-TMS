-- Bank-Feed §7 Q2 (Jorge-approved 2026-06-28): Seed banking.transaction_categories for TRANSP.
--
-- SCOPE: TRANSP operating company ONLY. TRK and USMCA are intentionally excluded until AF-1
-- (#1528 catalogs.accounts per-entity) merges — seeding them before AF-1 risks cross-entity
-- account resolution (entity-scope contamination).
--
-- PURPOSE: Suggestion-only. These rows feed autoCategorize() in plaid.service.ts which stamps
-- banking.bank_transactions.coa_account_id as a suggested category. This does NOT auto-post to
-- GL, does NOT write journal entries, and does NOT flip any flag. The suggestion appears in the
-- For Review UI; a human must still confirm + categorize + (after Option B is built) post.
--
-- PATTERN MATCHING: plaid_category_pattern is matched against bank_transaction.plaid_category[]
-- (Plaid's primary-detail category hierarchy, e.g. ["TRANSPORTATION", "GAS_STATIONS"]).
-- The matcher normalizes to uppercase and does substring or wildcard (*) match (see matchesRule
-- in apps/backend/src/integrations/plaid/plaid.service.ts). Lower priority = matched first.
--
-- Account UUIDs (TRANSP COA, catalogs.accounts, verified 2026-06-13 from expense_category_account_map seed):
--   fuel          58c6e304-ab3e-4714-9c35-623ec51ae7cf  6100            Fuel Expense
--   maintenance   27c4a09a-0d34-4908-9da1-44b6174b5bce  QBO-1150040031  Repair & Maintenance Expenses
--   insurance     fdfacf6c-5c60-4b60-a55d-84c88a497e59  QBO-7           Vehicle Insurance Expenses
--   driver_pay    4aa75ca4-859b-4721-bea4-947a98f2171d  QBO-48          COL-Line Haul Driver Payment
--   factoring_fee ad466f4d-322b-4319-abec-00ac45f9fefd  QBO-1150040129  Bank-Finance-Factoring Expenses
--   toll          7d795152-0883-41ef-80ee-91de1f97f9bb  QBO-38          OTR-Bridge & Toll Expenses
--   office        2e482459-e722-439d-a444-6f700d42414e  QBO-12          Office/General/Administrative Expenses
--   other         4cec8ed2-4dbc-4765-8a59-ace3ce45a7d7  QBO-25          Uncategorized Expense (catch-all)
--
-- Idempotent: ON CONFLICT DO NOTHING on (operating_company_id, plaid_category_pattern) unique index.
-- Additive: does not alter any existing row, does not drop any row.
-- No GL writes. No posting. No flag flip.

BEGIN;

INSERT INTO banking.transaction_categories (
  operating_company_id,
  plaid_category_pattern,
  coa_account_id,
  priority,
  is_active
)
SELECT
  c.id AS operating_company_id,
  m.pattern,
  m.account_id::uuid,
  m.priority,
  true
FROM org.companies c
CROSS JOIN (
  VALUES
    -- Priority 10 — most-specific fuel signals (gas stations, fuel)
    ('GAS_STATIONS',                   '58c6e304-ab3e-4714-9c35-623ec51ae7cf', 10),
    ('FUEL',                           '58c6e304-ab3e-4714-9c35-623ec51ae7cf', 10),
    -- Priority 20 — broad Plaid TRANSPORTATION category → fuel (trucking primary expense)
    ('TRANSPORTATION',                 '58c6e304-ab3e-4714-9c35-623ec51ae7cf', 20),
    -- Priority 30 — maintenance / repairs
    ('AUTO_MAINTENANCE',               '27c4a09a-0d34-4908-9da1-44b6174b5bce', 30),
    ('AUTO_PARTS',                     '27c4a09a-0d34-4908-9da1-44b6174b5bce', 30),
    ('AUTO_DEALERS',                   '27c4a09a-0d34-4908-9da1-44b6174b5bce', 35),
    -- Priority 40 — tolls / road charges
    ('TOLL',                           '7d795152-0883-41ef-80ee-91de1f97f9bb', 40),
    ('PARKING',                        '7d795152-0883-41ef-80ee-91de1f97f9bb', 45),
    -- Priority 50 — insurance
    ('INSURANCE',                      'fdfacf6c-5c60-4b60-a55d-84c88a497e59', 50),
    -- Priority 60 — driver pay / payroll
    ('PAYROLL',                        '4aa75ca4-859b-4721-bea4-947a98f2171d', 60),
    -- Priority 70 — factoring / finance charges
    ('BANK_FEES',                      'ad466f4d-322b-4319-abec-00ac45f9fefd', 70),
    ('FINANCIAL',                      'ad466f4d-322b-4319-abec-00ac45f9fefd', 75),
    -- Priority 80 — office / admin
    ('OFFICE_SUPPLIES',                '2e482459-e722-439d-a444-6f700d42414e', 80),
    ('BUSINESS_SERVICES',              '2e482459-e722-439d-a444-6f700d42414e', 85),
    ('GENERAL_SERVICES',               '2e482459-e722-439d-a444-6f700d42414e', 88),
    -- Priority 90 — catch-all (lowest priority, matched last)
    ('OTHER',                          '4cec8ed2-4dbc-4765-8a59-ace3ce45a7d7', 90),
    ('GENERAL_MERCHANDISE',            '4cec8ed2-4dbc-4765-8a59-ace3ce45a7d7', 92)
) AS m(pattern, account_id, priority)
-- TRANSP only — TRK/USMCA held until AF-1 merges
WHERE c.code = 'TRANSP'
  AND c.is_active = true
  AND c.deactivated_at IS NULL
  AND EXISTS (
    SELECT 1 FROM catalogs.accounts a WHERE a.id = m.account_id::uuid
  )
ON CONFLICT DO NOTHING;

-- Drift-capture signal: expect 17 rows for TRANSP on prod; 0 on bare CI (no accounts seeded).
SELECT
  count(*) AS transp_transaction_categories_seeded,
  'TRANSP-only, suggestion-only, no GL writes' AS scope_note
FROM banking.transaction_categories
WHERE is_active = true;

COMMIT;
