-- SCENTSX B11 — ScentsX LLC's books complete on the shared engine.
--
-- Owner 2026-11-26 23:19 CT: "WE NEED THE TABLES THE CHART OF ACCOUNTS, THE LISTS THE CATALOGS, AP AR, BALANCE SHEETS, CASH
-- METHOD AND ACCRUAL METHOD … FULL AND TOTAL COMPLETE BOOKS … WITH THE CORRECT ENGINES BUILT, DATA SHOULD BE SHARED COMPLETELY
-- BETWEEN MODULES. DO NOT MAKE A MESS AS WITH THE TRUCKING APP." 21:37 CT: bank names are "irrelevant right now".
--
-- ScentsX already runs on the same accounting engine as the carriers (one engine, its own company row — 202616820200). What it
-- was missing to keep complete books there (measured on a fresh fork of prod, br-late-flower-ak5a4e49, 2026-11-26 23:25 CT):
--   * no bank / cash / card / loan / payroll / other-income accounts, so no payment, deposit, bill payment, expense or transfer
--     could name where money moved, and operating_bank was unbound (disbursements fail closed);
--   * 0 rows in every company-scoped list the money screens read: payment terms, payment methods, void reasons, vendor types,
--     expense categories, products & services;
--   * the generic posting flags (invoice → A/R, customer payment, bill → A/P, bill payment, expense, bank feed, transfer, void
--     reversal, period close) were ON only for the carriers, so a ScentsX invoice or bill would sit in a sub-ledger with no GL.
-- This migration adds exactly those, ScentsX-only. Nothing trucking-specific is copied (no drivers, loads, fuel, IFTA,
-- factoring, settlements, revenue recognition by load, leases of trucks) and no QBO flag is turned on (ScentsX has no QBO file).
-- Bank accounts are generic names; the owner renames them in the chart when he names the banks. No opening balances.
-- Every insert is NOT EXISTS / ON CONFLICT guarded — idempotent; a from-scratch CI database and prod land in the same state.

BEGIN;

DO $$
DECLARE
  v_co uuid;
  v_acct uuid;
  v_owner uuid;
  r RECORD;
BEGIN
  SELECT id INTO v_co FROM org.companies WHERE code = 'SCENTSX';
  IF v_co IS NULL THEN
    RAISE NOTICE 'SCENTSX company not found — nothing to complete';
    RETURN;
  END IF;
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  PERFORM set_config('app.operating_company_id', v_co::text, true);

  -- 1. Accounts the books need to record money (QuickBooks detail types in account_subtype).
  FOR r IN
    SELECT * FROM (VALUES
      ('1000', 'Operating Checking',                         'Asset',        'Checking',                          'bank_operating'),
      ('1010', 'Store Cash Registers',                       'Asset',        'CashOnHand',                        NULL),
      ('1020', 'Petty Cash',                                 'Asset',        'CashOnHand',                        NULL),
      ('1030', 'Card Settlements Receivable',                'Asset',        'Other Current Assets',              NULL),
      ('1150', 'Notes Receivable - Pagarés',                 'Asset',        'Other Current Assets',              NULL),
      ('1310', 'Supplier Deposits (Prepaid Inventory)',      'Asset',        'Prepaid Expenses',                  NULL),
      ('2010', 'Business Credit Card',                       'Liability',    'Credit Card',                       NULL),
      ('2300', 'Payroll Liabilities',                        'Liability',    'Payroll Tax Payable',               NULL),
      ('2400', 'Loans from Owner',                           'Liability',    'Loan Payable',                      NULL),
      ('2500', 'Notes Payable',                              'Liability',    'Notes Payable',                     NULL),
      ('6010', 'Utilities',                                  'Expense',      'Utilities',                         NULL),
      ('6020', 'Wages & Salaries',                           'Expense',      'Payroll Expenses',                  NULL),
      ('6030', 'Payroll Taxes',                              'Expense',      'Payroll Expenses',                  NULL),
      ('6040', 'Telephone & Internet',                       'Expense',      'Utilities',                         NULL),
      ('6050', 'Office Supplies',                            'Expense',      'Office/General Administrative Expenses', NULL),
      ('6060', 'Repairs & Maintenance',                      'Expense',      'Repair & Maintenance',              NULL),
      ('6070', 'Licenses, Permits & Fees',                   'Expense',      'Taxes Paid',                        NULL),
      ('6080', 'Travel & Meals',                             'Expense',      'Travel',                            NULL),
      ('6090', 'Packaging & Store Supplies',                 'Expense',      'Supplies & Materials',              NULL),
      ('7000', 'Interest Income',                            'OtherIncome',  'Interest Earned',                   NULL),
      ('7100', 'Other Income',                               'OtherIncome',  'Other Miscellaneous Income',        NULL),
      ('7200', 'Foreign Exchange Gain / Loss',               'OtherExpense', 'Exchange Gain or Loss',             NULL),
      ('7300', 'Interest Expense',                           'OtherExpense', 'Interest Paid',                     NULL)
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

  -- 1b. The bank-register rows the Banking screens, deposits, payments and transfers pick (banking.bank_accounts → GL account).
  INSERT INTO banking.bank_accounts (operating_company_id, account_name, display_name, account_type, account_class, ledger_account_id,
                                     is_petty_cash, sync_status, display_order)
  SELECT v_co, t.n, t.n, t.typ, t.cls, a.id, t.petty, 'active', t.ord
    FROM (VALUES ('Operating Checking', 'checking', 'depository', '1000', false, 10),
                 ('Store Cash Registers', 'cash_on_hand', 'depository', '1010', false, 20),
                 ('Petty Cash', 'petty_cash', 'depository', '1020', true, 30),
                 ('Business Credit Card', 'credit_card', 'credit', '2010', false, 40)) t(n, typ, cls, num, petty, ord)
    JOIN catalogs.accounts a ON a.operating_company_id = v_co AND a.account_number = t.num AND a.deactivated_at IS NULL
   WHERE NOT EXISTS (SELECT 1 FROM banking.bank_accounts b WHERE b.operating_company_id = v_co AND b.ledger_account_id = a.id AND b.deactivated_at IS NULL);

  -- 2. Role bindings the shared posters resolve. One active binding per (company, role); an owner re-designation is kept.
  FOR r IN
    SELECT * FROM (VALUES
      ('operating_bank',                 '1000'),
      ('interest_income',                '7000'),
      ('gain_loss_on_disposal',          '7100'),
      ('rent_expense',                   '6000'),
      ('insurance_expense',              '6500'),
      ('amortization_expense_default',   '6800'),
      ('related_party_loan_parent',      '2400'),
      ('related_party_interest_expense', '7300')
    ) AS t(role, num)
  LOOP
    SELECT a.id INTO v_acct FROM catalogs.accounts a
     WHERE a.operating_company_id = v_co AND a.account_number = r.num AND a.deactivated_at IS NULL AND a.is_postable
     LIMIT 1;
    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'SCENTSX account % missing for role % — refusing to bind blind', r.num, r.role;
    END IF;
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    SELECT v_co, r.role, v_acct, true
    WHERE NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles x
                       WHERE x.operating_company_id = v_co AND x.role = r.role AND x.is_active);
  END LOOP;

  -- 3. Lists (catalogs) the money screens read, ScentsX's own values.
  INSERT INTO catalogs.payment_terms (operating_company_id, terms_name, days_until_due)
  SELECT v_co, t.n, t.d FROM (VALUES ('Due on Receipt', 0), ('Net 7', 7), ('Net 15', 15), ('Net 30', 30), ('Net 45', 45), ('Net 60', 60)) t(n, d)
  ON CONFLICT (operating_company_id, terms_name) DO NOTHING;

  INSERT INTO catalogs.payment_methods (operating_company_id, code, display_name, sort_order, gl_account_id)
  SELECT v_co, t.c, t.n, t.s, (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = v_co AND a.account_number = t.acct AND a.deactivated_at IS NULL LIMIT 1)
    FROM (VALUES ('CASH', 'Cash', 10, '1010'), ('CHECK', 'Check', 20, NULL), ('ACH', 'ACH transfer', 30, NULL), ('WIRE', 'Wire', 40, NULL),
                 ('CARD', 'Credit / debit card', 50, '1030'), ('ZELLE', 'Zelle', 60, NULL), ('MONEY_ORDER', 'Money order', 70, NULL),
                 ('CASHIERS_CHECK', 'Cashier''s check', 80, NULL), ('BUSINESS_CARD', 'Business credit card (paid with)', 90, '2010')) t(c, n, s, acct)
  ON CONFLICT (operating_company_id, code) DO NOTHING;

  SELECT u.id INTO v_owner FROM identity.users u
   WHERE u.role = 'Owner' AND u.deactivated_at IS NULL AND u.archived_at IS NULL ORDER BY u.created_at LIMIT 1;
  IF v_owner IS NOT NULL THEN
    INSERT INTO catalogs.void_cancel_reasons (operating_company_id, reason_code, reason_label, requires_note, sort_order, system_seeded, created_by_user_id)
    SELECT v_co, t.c, t.l, t.req, t.s, true, v_owner
      FROM (VALUES ('duplicate', 'Duplicate', false, 10), ('error', 'Entered in error', false, 20), ('wrong_amount', 'Wrong amount', false, 30),
                   ('customer_dispute', 'Customer dispute', true, 40), ('returned_goods', 'Goods returned', true, 50),
                   ('cancelled_order', 'Order cancelled', false, 60), ('other', 'Other', true, 90)) t(c, l, req, s)
    ON CONFLICT (operating_company_id, reason_code) DO NOTHING;
  END IF;

  INSERT INTO catalogs.vendor_types (operating_company_id, vendor_type_name, vendor_type_code, code, display_name, sort_order)
  SELECT v_co, t.n, t.c, t.c, t.n, t.s
    FROM (VALUES ('Perfume supplier', 'PERFUME_SUPPLIER', 10), ('Brand / authorized distributor', 'BRAND_DISTRIBUTOR', 20),
                 ('Freight / courier', 'FREIGHT', 30), ('Customs broker', 'CUSTOMS_BROKER', 40), ('Packaging & supplies', 'PACKAGING', 50),
                 ('Rent / landlord', 'RENT', 60), ('Software & services', 'SOFTWARE', 70), ('Professional services', 'PROFESSIONAL', 80),
                 ('Utilities & telecom', 'UTILITIES', 90), ('Other', 'OTHER', 99)) t(n, c, s)
   WHERE NOT EXISTS (SELECT 1 FROM catalogs.vendor_types v WHERE v.operating_company_id = v_co AND v.vendor_type_code = t.c);

  INSERT INTO catalogs.expense_categories (operating_company_id, code, display_name, sort_order, metadata)
  SELECT v_co, t.c, t.n, t.s, jsonb_build_object('account_number', t.acct)
    FROM (VALUES ('RENT', 'Rent - warehouse & store', 10, '6000'), ('UTILITIES', 'Utilities', 20, '6010'), ('PAYROLL', 'Wages & salaries', 30, '6020'),
                 ('PAYROLL_TAX', 'Payroll taxes', 35, '6030'), ('PHONE', 'Telephone & internet', 40, '6040'), ('OFFICE', 'Office supplies', 50, '6050'),
                 ('REPAIRS', 'Repairs & maintenance', 60, '6060'), ('LICENSES', 'Licenses, permits & fees', 70, '6070'), ('TRAVEL', 'Travel & meals', 80, '6080'),
                 ('PACKAGING', 'Packaging & store supplies', 90, '6090'), ('CARD_FEES', 'Card processing fees', 100, '6100'),
                 ('BANK_FEES', 'Bank charges & wire fees', 110, '6110'), ('SHIPPING_OUT', 'Shipping out', 120, '6200'),
                 ('SOFTWARE', 'Software & subscriptions', 130, '6300'), ('MARKETING', 'Trade shows & marketing', 140, '6400'),
                 ('INSURANCE', 'Insurance', 150, '6500'), ('PROFESSIONAL', 'Legal & professional fees', 160, '6600'),
                 ('FREIGHT_IN', 'Freight in (on purchases)', 170, '5100'), ('CUSTOMS', 'Customs duties & broker fees', 180, '5110'),
                 ('OTHER', 'Other / uncategorized', 990, '6990')) t(c, n, s, acct)
  ON CONFLICT (operating_company_id, code) DO NOTHING;

  -- The category → account map the expense poster reads (category_kind is the engine's fixed list: office / insurance / other).
  INSERT INTO accounting.expense_category_account_map (operating_company_id, category_kind, category_code, account_id, posting_side)
  SELECT v_co, CASE e.code WHEN 'OFFICE' THEN 'office' WHEN 'INSURANCE' THEN 'insurance' ELSE 'other' END, e.code, a.id, 'debit'
    FROM catalogs.expense_categories e
    JOIN catalogs.accounts a ON a.operating_company_id = v_co AND a.account_number = e.metadata->>'account_number' AND a.deactivated_at IS NULL
   WHERE e.operating_company_id = v_co
     AND NOT EXISTS (SELECT 1 FROM accounting.expense_category_account_map m
                      WHERE m.operating_company_id = v_co AND m.category_code = e.code AND m.is_active);

  -- Products & services the invoice / bill lines pick (each carries its income or expense account).
  INSERT INTO catalogs.items (operating_company_id, item_name, item_code, item_type, description, taxable, default_income_account_id, default_expense_account_id)
  SELECT v_co, t.n, t.c, t.typ, t.d, t.tax,
         (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = v_co AND a.account_number = t.inc AND a.deactivated_at IS NULL LIMIT 1),
         (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = v_co AND a.account_number = t.exp AND a.deactivated_at IS NULL LIMIT 1)
    FROM (VALUES
      ('Perfume - wholesale',          'PERF-WHOLESALE', 'NonInventory', 'Fragrance sold wholesale (units come from the stock ledger)', true,  '4000', '5000'),
      ('Perfume - retail',             'PERF-RETAIL',    'NonInventory', 'Fragrance sold at retail',                                    true,  '4010', '5000'),
      ('Perfume - export',             'PERF-EXPORT',    'NonInventory', 'Fragrance exported (tax-free with export proof)',              false, '4020', '5000'),
      ('Cosmetics & beauty - wholesale','BEAUTY-WHOLESALE','NonInventory','Cosmetics, skin care and beauty sold wholesale',              true,  '4000', '5000'),
      ('Shipping charged',             'SHIP-CHARGED',   'Service',      'Shipping billed to the customer',                             false, '4100', NULL),
      ('Sales discount',               'DISCOUNT',       'Discount',     'Discount given on an invoice',                                false, '4810', NULL),
      ('Return / allowance',           'RETURN',         'Charge',       'Credit for goods returned or an allowance',                   false, '4800', NULL),
      ('Freight in',                   'FREIGHT-IN',     'Service',      'Freight on purchases (bills)',                                false, NULL,   '5100'),
      ('Customs duties & broker',      'CUSTOMS',        'Service',      'Duties and customs-broker fees on purchases (bills)',         false, NULL,   '5110')
    ) AS t(n, c, typ, d, tax, inc, exp)
   WHERE NOT EXISTS (SELECT 1 FROM catalogs.items i WHERE i.operating_company_id = v_co AND i.item_code = t.c AND i.deactivated_at IS NULL);

  -- 4. The generic money flags ON for SCENTSX (per-entity overrides; global defaults and the carriers are untouched).
  IF v_owner IS NOT NULL THEN
    INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    SELECT gen_random_uuid(), f.flag_key, v_co, NULL, true, v_owner, now(), NULL
      FROM lib.feature_flags f
     WHERE f.flag_key IN (
       'GL_POSTING_ENABLED', 'INVOICE_AR_GL_POSTING_ENABLED', 'CUSTOMER_PAYMENT_GL_POSTING_ENABLED', 'BILL_GL_POSTING_ENABLED',
       'BILL_PAYMENT_GL_POSTING_ENABLED', 'EXPENSE_GL_POSTING_ENABLED', 'BANK_FEED_GL_POSTING_ENABLED', 'BANK_TX_SPLIT_ENABLED',
       'BANK_TX_SPLIT_GL_POSTING_ENABLED', 'TRANSFER_GL_POSTING_ENABLED', 'MONEY_CONTROL_VOID_REVERSAL_ENABLED', 'VOID_ENFORCEMENT_ENABLED',
       'MONEY_CONTROL_PERIOD_CLOSE_ENABLED', 'MONEY_CONTROL_PERIOD_REOPEN_ENABLED', 'PERIODS_INIT_ENABLED', 'AR_AP_AGING_UI_ENABLED',
       'FINANCE_STATEMENTS_UI_ENABLED', 'INVOICE_DISPUTE_ENABLED', 'PREPAID_EXPENSES_ENABLED', 'PREPAID_EXPENSES_POST_ENABLED',
       'AMORTIZATION_GL_POSTING_ENABLED', 'FIXED_ASSETS_ENABLED', 'FIXED_ASSET_AUTOPOST_ENABLED', 'REIMBURSEMENT_GL_POSTING_ENABLED',
       'RELATED_PARTY_LOAN_GL_POSTING_ENABLED', 'VENDOR_PAYMENT_METHODS_ENABLED', 'TAX_DOC_1099_ENABLED', 'AP_IMPORT_ENABLED',
       'CASH_FORECAST_ENABLED', 'OPENING_BALANCE_IMPORT_ENABLED', 'OPENING_BALANCE_BOOKKEEPER_CONFIRM', 'MY_ACCOUNTANT_ENABLED',
       'PERMISSION_MODEL_ENFORCED', 'BANK_ACCOUNT_HIDE_ENABLED', 'PETTY_CASH_CHECK_TRANSFER_ENABLED')
    ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL DO NOTHING;
  END IF;
END $$;

COMMIT;
