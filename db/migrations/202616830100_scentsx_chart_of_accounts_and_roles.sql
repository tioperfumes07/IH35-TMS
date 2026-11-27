-- SCENTSX B2 — ScentsX LLC (TIO Perfumes) native chart of accounts + its role bindings.
--
-- Owner 2026-11-26 20:13 CT "Own company, same engine"; 20:16 CT "full accounting engines … complete wiring to ledgers,
-- liabilities, assets"; 20:18 CT multiple inventories, warehouses, retail, price levels, credit limits.
-- Design: https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC (section "Ledger wiring", block B2).
--
-- WHAT: a goods-trading chart in catalogs.accounts for SCENTSX only (perpetual inventory: inventory, goods received not
-- billed, cost of goods sold, sales of goods, sales tax), and the role bindings in accounting.chart_of_accounts_roles so
-- the EXISTING poster resolves every ScentsX account by role. Same seed path as USMCA's chart (202606300060 /
-- 202611150000): app.operating_company_id is set to SCENTSX for the transaction so FORCE RLS accepts the rows, and every
-- insert is NOT EXISTS-guarded (idempotent; a from-scratch CI database and prod land in the same state).
--
-- WHAT IS DELIBERATELY NOT HERE (owner facts not given yet — never guessed):
--   * No bank account and no operating_bank binding (design D3: bank name + last 4). A ScentsX disbursement with no
--     chosen source fails closed until the owner names the bank.
--   * No credit-card, loan or note accounts (none named by the owner).
--   * Opening balances are ZERO — the owner enters them (standing rule; design D5).
--   * No accounting.periods rows — the books start date is the owner's (design D5).
--   * Per-location inventory accounts — added when the owner names ScentsX's own sites (design D2); until then one
--     Inventory account carries every location and the inventory ledger (B4) keeps the location.
-- Goods-only roles (inventory, GRNI, COGS, freight-in, shrink, write-down, price variance, customer deposits, sales
-- returns) are new role values and land with the goods posting source types in 202616840100 (B3); the accounts they
-- will bind to are seeded now.

BEGIN;

DO $$
DECLARE
  v_co uuid;
  v_acct uuid;
  r RECORD;
BEGIN
  SELECT id INTO v_co FROM org.companies WHERE code = 'SCENTSX';
  IF v_co IS NULL THEN
    RAISE EXCEPTION 'SCENTSX company not found (202616820200 must run first) — refusing to seed a chart blind';
  END IF;
  PERFORM set_config('app.operating_company_id', v_co::text, true);

  FOR r IN
    SELECT * FROM (VALUES
      -- number, name, account_type, account_subtype (QuickBooks detail type), system_purpose
      ('1090', 'Undeposited Funds',                        'Asset',           'Undeposited Funds',                  'undeposited_funds'),
      ('1100', 'Accounts Receivable (A/R)',                'Asset',           'Accounts Receivable (A/R)',          'accounts_receivable'),
      ('1110', 'Allowance for Doubtful Accounts',          'Asset',           'Allowance for Bad Debts',            NULL),
      ('1200', 'Inventory',                                'Asset',           'Inventory',                          NULL),
      ('1290', 'Inventory in Transit',                     'Asset',           'Inventory',                          NULL),
      ('1300', 'Prepaid Expenses',                         'Asset',           'Prepaid Expenses',                   NULL),
      ('1500', 'Store Fixtures & Equipment',               'Asset',           'Furniture & Fixtures',               NULL),
      ('1600', 'Accumulated Depreciation',                 'Asset',           'Accumulated Depreciation',           NULL),
      ('1900', 'Inter-company Receivable',                 'Asset',           'Other Current Assets',               NULL),
      ('2000', 'Accounts Payable (A/P)',                   'Liability',       'Accounts Payable (A/P)',             'accounts_payable'),
      ('2050', 'Goods Received Not Billed',                'Liability',       'Other Current Liabilities',          NULL),
      ('2100', 'Sales Tax Payable - Texas',                'Liability',       'Sales Tax Payable',                  NULL),
      ('2150', 'Customer Deposits',                        'Liability',       'Other Current Liabilities',          NULL),
      ('2200', 'Accrued Expenses',                         'Liability',       'Other Current Liabilities',          NULL),
      ('2900', 'Inter-company Payable',                    'Liability',       'Other Current Liabilities',          NULL),
      ('3000', 'Owner''s Capital / Contributions',         'Equity',          'Owner''s Equity',                    NULL),
      ('3100', 'Owner''s Draws',                           'Equity',          'Partner Distributions',              NULL),
      ('3800', 'Opening Balance Equity',                   'Equity',          'Opening Balance Equity',             NULL),
      ('3900', 'Retained Earnings',                        'Equity',          'Retained Earnings',                  'retained_earnings'),
      ('4000', 'Sales of Goods - Wholesale',               'Income',          'Sales of Product Income',            NULL),
      ('4010', 'Sales of Goods - Retail',                  'Income',          'Sales of Product Income',            NULL),
      ('4020', 'Sales of Goods - Export',                  'Income',          'Sales of Product Income',            NULL),
      ('4100', 'Shipping Charged to Customers',            'Income',          'Sales of Product Income',            NULL),
      ('4800', 'Sales Returns & Allowances',               'Income',          'Discounts/Refunds Given',            NULL),
      ('4810', 'Sales Discounts',                          'Income',          'Discounts/Refunds Given',            NULL),
      ('5000', 'Cost of Goods Sold',                       'CostOfGoodsSold', 'Supplies & Materials - COGS',        NULL),
      ('5100', 'Freight In',                               'CostOfGoodsSold', 'Shipping, Freight & Delivery - COS', NULL),
      ('5110', 'Customs Duties & Broker Fees',             'CostOfGoodsSold', 'Other Costs of Services - COS',      NULL),
      ('5200', 'Inventory Shrink & Damage',                'CostOfGoodsSold', 'Supplies & Materials - COGS',        NULL),
      ('5210', 'Inventory Write-down to Net Realizable Value', 'CostOfGoodsSold', 'Supplies & Materials - COGS',    NULL),
      ('5300', 'Purchase Price Variance',                  'CostOfGoodsSold', 'Supplies & Materials - COGS',        NULL),
      ('6000', 'Rent - Warehouse & Store',                 'Expense',         'Rent or Lease of Buildings',         NULL),
      ('6100', 'Card Processing Fees',                     'Expense',         'Bank Charges',                       NULL),
      ('6110', 'Bank Service Charges & Wire Fees',         'Expense',         'Bank Charges',                       NULL),
      ('6200', 'Shipping Out',                             'Expense',         'Shipping, Freight & Delivery',       NULL),
      ('6300', 'Software & Subscriptions',                 'Expense',         'Dues & subscriptions',               NULL),
      ('6400', 'Trade Shows & Marketing',                  'Expense',         'Advertising/Promotional',            NULL),
      ('6500', 'Insurance',                                'Expense',         'Insurance',                          NULL),
      ('6600', 'Legal & Professional Fees',                'Expense',         'Legal & Professional Fees',          NULL),
      ('6700', 'Bad Debt Expense',                         'Expense',         'Bad Debts',                          NULL),
      ('6800', 'Depreciation Expense',                     'Expense',         'Depreciation',                       NULL),
      ('6990', 'Uncategorized Expense',                    'Expense',         'Other Miscellaneous Service Cost',   NULL),
      ('9000', 'Ask My Accountant',                        'Expense',         'Other Miscellaneous Service Cost',   'ask_my_accountant')
    ) AS t(num, nm, typ, sub, purpose)
  LOOP
    INSERT INTO catalogs.accounts
      (operating_company_id, account_number, account_name, account_type, account_subtype, system_purpose, is_postable)
    SELECT v_co, r.num, r.nm, r.typ, r.sub, r.purpose, true
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogs.accounts a
       WHERE a.operating_company_id = v_co AND a.deactivated_at IS NULL
         AND (a.account_number = r.num OR a.account_name = r.nm));
  END LOOP;

  -- Role bindings for roles the existing poster already knows. One active binding per (company, role) — the
  -- uq_coa_roles_company_role_active index; NOT EXISTS keeps a re-run (or an owner re-designation) untouched.
  FOR r IN
    SELECT * FROM (VALUES
      ('ar_control',             '1100'),
      ('ap_control',             '2000'),
      ('undeposited_funds',      '1090'),
      ('revenue_default',        '4000'),
      ('sales_tax_payable',      '2100'),
      ('retained_earnings',      '3900'),
      ('prepaid_asset_default',  '1300'),
      ('fixed_asset_default',    '1500'),
      ('accum_depr_default',     '1600'),
      ('depr_expense_default',   '6800'),
      ('bad_debt_expense',       '6700'),
      ('expense_default',        '6990'),
      ('other_operating_expense','6990'),
      ('uncategorized_expense',  '6990')
    ) AS t(role, num)
  LOOP
    SELECT a.id INTO v_acct FROM catalogs.accounts a
     WHERE a.operating_company_id = v_co AND a.account_number = r.num
       AND a.deactivated_at IS NULL AND a.is_postable = true
     LIMIT 1;
    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'SCENTSX account % missing for role % — refusing to bind blind', r.num, r.role;
    END IF;
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    SELECT v_co, r.role, v_acct, true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.chart_of_accounts_roles x
       WHERE x.operating_company_id = v_co AND x.role = r.role AND x.is_active = true);
  END LOOP;
END $$;

COMMIT;
