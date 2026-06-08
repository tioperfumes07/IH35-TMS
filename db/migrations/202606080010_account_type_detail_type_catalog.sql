-- CA-01 — QBO-Parity Account Type & Detail Type Catalog
-- Creates catalogs.account_types (15 types / 5 groups) and catalogs.detail_types.
-- Source of truth: ACCOUNT-TYPE-DETAIL-TYPE-CATALOG.md (QBO live capture, IH 35 Transportation LLC)
-- Standing Order #16 v2: self-contained, explicit GRANTs, 12-digit filename, idempotent seed.
--
-- DRIFT-CAPTURE NOTE: if rows are ever manually purged from either table outside of migration tooling,
-- re-run the INSERT blocks below (ON CONFLICT DO NOTHING makes them safe to replay).

BEGIN;

-- schema already exists (0010_catalogs_init.sql); guard is idempotent
CREATE SCHEMA IF NOT EXISTS catalogs;

-- ─── account_types ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalogs.account_types (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text        NOT NULL UNIQUE,
  name           text        NOT NULL,
  group_label    text        NOT NULL,
  statement      text        NOT NULL CHECK (statement IN ('BS', 'P&L')),
  normal_balance text        NOT NULL CHECK (normal_balance IN ('Debit', 'Credit')),
  default_action text        NOT NULL CHECK (default_action IN ('view_register', 'run_report')),
  sort_order     int         NOT NULL DEFAULT 0,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalogs_account_types_code
  ON catalogs.account_types (code);
CREATE INDEX IF NOT EXISTS idx_catalogs_account_types_group_label
  ON catalogs.account_types (group_label);

-- ─── detail_types ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalogs.detail_types (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_type_id      uuid        NOT NULL REFERENCES catalogs.account_types(id),
  name                 text        NOT NULL,
  qbo_detail_type_name text        NULL,
  sort_order           int         NOT NULL DEFAULT 0,
  is_active            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_type_id, name)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_detail_types_account_type_id
  ON catalogs.detail_types (account_type_id);

-- ─── GRANTs to ih35_app ──────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA catalogs TO ih35_app;

GRANT SELECT, INSERT, UPDATE ON catalogs.account_types TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.detail_types  TO ih35_app;

-- ─── Seed: 15 account types in 5 groups ──────────────────────────────────────

INSERT INTO catalogs.account_types
  (code, name, group_label, statement, normal_balance, default_action, sort_order)
VALUES
  -- ASSET (5)
  ('BANK',   'Bank',                        'ASSET',    'BS',  'Debit',  'view_register',  10),
  ('AR',     'Accounts receivable (A/R)',   'ASSET',    'BS',  'Debit',  'view_register',  20),
  ('OCA',    'Other Current Assets',        'ASSET',    'BS',  'Debit',  'view_register',  30),
  ('FA',     'Fixed Assets',                'ASSET',    'BS',  'Debit',  'view_register',  40),
  ('OA',     'Other Assets',                'ASSET',    'BS',  'Debit',  'view_register',  50),
  -- LIABILITY (4)
  ('CC',     'Credit Card',                 'LIABILITY','BS',  'Credit', 'view_register',  60),
  ('AP',     'Accounts payable (A/P)',      'LIABILITY','BS',  'Credit', 'view_register',  70),
  ('OCL',    'Other Current Liabilities',   'LIABILITY','BS',  'Credit', 'view_register',  80),
  ('LTL',    'Long Term Liabilities',       'LIABILITY','BS',  'Credit', 'view_register',  90),
  -- EQUITY (1)
  ('EQ',     'Equity',                      'EQUITY',   'BS',  'Credit', 'view_register', 100),
  -- INCOME (2)
  ('INC',    'Income',                      'INCOME',   'P&L', 'Credit', 'run_report',    110),
  ('OINC',   'Other Income',                'INCOME',   'P&L', 'Credit', 'run_report',    120),
  -- EXPENSE (3)
  ('COGS',   'Cost of Goods Sold',          'EXPENSE',  'P&L', 'Debit',  'run_report',    130),
  ('EXP',    'Expenses',                    'EXPENSE',  'P&L', 'Debit',  'run_report',    140),
  ('OEXP',   'Other Expense',               'EXPENSE',  'P&L', 'Debit',  'run_report',    150)
ON CONFLICT (code) DO NOTHING;

-- ─── Seed: detail types (all 15 account types) ────────────────────────────────

INSERT INTO catalogs.detail_types
  (account_type_id, name, qbo_detail_type_name, sort_order)
SELECT at.id, dt.name, dt.name, dt.sort_order
FROM (VALUES
  -- Bank (6)
  ('BANK', 'Cash on hand',                                   10),
  ('BANK', 'Checking',                                       20),
  ('BANK', 'Money Market',                                   30),
  ('BANK', 'Rents Held in Trust',                            40),
  ('BANK', 'Savings',                                        50),
  ('BANK', 'Trust account',                                  60),
  -- Accounts receivable (A/R) (1)
  ('AR',   'Accounts Receivable (A/R)',                      10),
  -- Other Current Assets (16)
  ('OCA',  'Allowance for Bad Debts',                        10),
  ('OCA',  'Assets Available for Sale',                      20),
  ('OCA',  'Development Costs',                              30),
  ('OCA',  'Employee Cash Advances',                         40),
  ('OCA',  'Inventory',                                      50),
  ('OCA',  'Investment - Mortgage/Real Estate Loans',        60),
  ('OCA',  'Investment - Tax-Exempt Securities',             70),
  ('OCA',  'Investment - U.S. Government Obligations',       80),
  ('OCA',  'Investments - Other',                            90),
  ('OCA',  'Loans To Officers',                             100),
  ('OCA',  'Loans to Others',                               110),
  ('OCA',  'Loans to Stockholders',                         120),
  ('OCA',  'Other Current Assets',                          130),
  ('OCA',  'Prepaid Expenses',                              140),
  ('OCA',  'Retainage',                                     150),
  ('OCA',  'Undeposited Funds',                             160),
  -- Fixed Assets (12)
  ('FA',   'Accumulated Amortization',                       10),
  ('FA',   'Accumulated Depletion',                          20),
  ('FA',   'Accumulated Depreciation',                       30),
  ('FA',   'Buildings',                                      40),
  ('FA',   'Depletable Assets',                              50),
  ('FA',   'Furniture & Fixtures',                           60),
  ('FA',   'Intangible Assets',                              70),
  ('FA',   'Land',                                           80),
  ('FA',   'Leasehold Improvements',                         90),
  ('FA',   'Machinery & Equipment',                         100),
  ('FA',   'Vehicles',                                      110),
  ('FA',   'Other fixed assets',                            120),
  -- Other Assets (7)
  ('OA',   'Accumulated Amortization of Other Assets',       10),
  ('OA',   'Goodwill',                                       20),
  ('OA',   'Lease Buyout',                                   30),
  ('OA',   'Licenses',                                       40),
  ('OA',   'Organizational Costs',                           50),
  ('OA',   'Other Long-term Assets',                         60),
  ('OA',   'Security Deposits',                              70),
  -- Credit Card (1)
  ('CC',   'Credit Card',                                    10),
  -- Accounts payable (A/P) (1)
  ('AP',   'Accounts Payable (A/P)',                         10),
  -- Other Current Liabilities (16)
  ('OCL',  'Deferred Revenue',                               10),
  ('OCL',  'Direct Deposit Payable',                         20),
  ('OCL',  'Federal Income Tax Payable',                     30),
  ('OCL',  'Garnishments Payable',                           40),
  ('OCL',  'Insurance Payable',                              50),
  ('OCL',  'Line of Credit',                                 60),
  ('OCL',  'Loan Payable',                                   70),
  ('OCL',  'Other Current Liabilities',                      80),
  ('OCL',  'Payroll Clearing',                               90),
  ('OCL',  'Payroll Tax Payable',                           100),
  ('OCL',  'Prepaid Expenses Payable',                      110),
  ('OCL',  'Rents in trust - Liability',                    120),
  ('OCL',  'Sales Tax Payable',                             130),
  ('OCL',  'State/Local Income Tax Payable',                140),
  ('OCL',  'Trust Accounts - Liabilities',                  150),
  ('OCL',  'Undistributed Tips',                            160),
  -- Long Term Liabilities (3)
  ('LTL',  'Notes Payable',                                  10),
  ('LTL',  'Other Long Term Liabilities',                    20),
  ('LTL',  'Shareholder Notes Payable',                      30),
  -- Equity (16)
  ('EQ',   'Accumulated Adjustment',                         10),
  ('EQ',   'Common Stock',                                   20),
  ('EQ',   'Estimated Taxes',                                30),
  ('EQ',   'Health Insurance Premium',                       40),
  ('EQ',   'Health Savings Account Contribution',            50),
  ('EQ',   'Opening Balance Equity',                         60),
  ('EQ',   'Owner''s Equity',                                70),
  ('EQ',   'Paid-In Capital or Surplus',                     80),
  ('EQ',   'Partner Contributions',                          90),
  ('EQ',   'Partner Distributions',                         100),
  ('EQ',   'Partner''s Equity',                             110),
  ('EQ',   'Personal Expense',                              120),
  ('EQ',   'Personal Income',                               130),
  ('EQ',   'Preferred Stock',                               140),
  ('EQ',   'Retained Earnings',                             150),
  ('EQ',   'Treasury Stock',                                160),
  -- Income (6)
  ('INC',  'Discounts/Refunds Given',                        10),
  ('INC',  'Non-Profit Income',                              20),
  ('INC',  'Other Primary Income',                           30),
  ('INC',  'Sales of Product Income',                        40),
  ('INC',  'Service/Fee Income',                             50),
  ('INC',  'Unapplied Cash Payment Income',                  60),
  -- Other Income (5)
  ('OINC', 'Dividend Income',                                10),
  ('OINC', 'Interest Earned',                                20),
  ('OINC', 'Other Investment Income',                        30),
  ('OINC', 'Other Miscellaneous Income',                     40),
  ('OINC', 'Tax-Exempt Interest',                            50),
  -- Cost of Goods Sold (5)
  ('COGS', 'Cost of labor - COS',                            10),
  ('COGS', 'Equipment Rental - COS',                         20),
  ('COGS', 'Other Costs of Services - COS',                  30),
  ('COGS', 'Shipping, Freight & Delivery - COS',             40),
  ('COGS', 'Supplies & Materials - COGS',                    50),
  -- Expenses (31)
  ('EXP',  'Advertising/Promotional',                        10),
  ('EXP',  'Auto',                                           20),
  ('EXP',  'Bad Debts',                                      30),
  ('EXP',  'Bank Charges',                                   40),
  ('EXP',  'Charitable Contributions',                       50),
  ('EXP',  'Communication',                                  60),
  ('EXP',  'Cost of Labor',                                  70),
  ('EXP',  'Dues & subscriptions',                           80),
  ('EXP',  'Entertainment',                                  90),
  ('EXP',  'Entertainment Meals',                           100),
  ('EXP',  'Equipment Rental',                              110),
  ('EXP',  'Finance costs',                                 120),
  ('EXP',  'Insurance',                                     130),
  ('EXP',  'Interest Paid',                                 140),
  ('EXP',  'Legal & Professional Fees',                     150),
  ('EXP',  'Office/General Administrative Expenses',        160),
  ('EXP',  'Other Business Expenses',                       170),
  ('EXP',  'Other Miscellaneous Service Cost',              180),
  ('EXP',  'Payroll Expenses',                              190),
  ('EXP',  'Payroll Tax Expenses',                          200),
  ('EXP',  'Payroll Wage Expenses',                         210),
  ('EXP',  'Promotional Meals',                             220),
  ('EXP',  'Rent or Lease of Buildings',                    230),
  ('EXP',  'Repair & Maintenance',                          240),
  ('EXP',  'Shipping, Freight & Delivery',                  250),
  ('EXP',  'Supplies & Materials',                          260),
  ('EXP',  'Taxes Paid',                                    270),
  ('EXP',  'Travel',                                        280),
  ('EXP',  'Travel Meals',                                  290),
  ('EXP',  'Unapplied Cash Bill Payment Expense',           300),
  ('EXP',  'Utilities',                                     310),
  -- Other Expense (18)
  ('OEXP', 'Amortization',                                   10),
  ('OEXP', 'Depreciation',                                   20),
  ('OEXP', 'Exchange Gain or Loss',                          30),
  ('OEXP', 'Gas And Fuel',                                   40),
  ('OEXP', 'Home Office Expense',                            50),
  ('OEXP', 'Other Home Office Expenses',                     60),
  ('OEXP', 'Other Miscellaneous Expense',                    70),
  ('OEXP', 'Other Vehicle Expenses',                         80),
  ('OEXP', 'Parking and Tolls',                              90),
  ('OEXP', 'Penalties & Settlements',                       100),
  ('OEXP', 'Vehicle',                                       110),
  ('OEXP', 'Vehicle Insurance',                             120),
  ('OEXP', 'Vehicle Lease',                                 130),
  ('OEXP', 'Vehicle Loan',                                  140),
  ('OEXP', 'Vehicle Loan Interest',                         150),
  ('OEXP', 'Vehicle Registration',                          160),
  ('OEXP', 'Vehicle Repairs',                               170),
  ('OEXP', 'Wash and Road Services',                        180)
) AS dt(type_code, name, sort_order)
JOIN catalogs.account_types at ON at.code = dt.type_code
ON CONFLICT (account_type_id, name) DO NOTHING;

COMMIT;
