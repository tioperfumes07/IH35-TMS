# Account Type & Detail Type Catalog — canonical (QBO parity)
Source: captured live from IH 35 Transportation LLC QBO + completed to the full QuickBooks US catalog.
Use this to seed catalogs.account_types + catalogs.detail_types (Block CA-01). When wiring, reconcile
once against the live QBO dropdown and add any company-specific detail types found there.

LEGEND: STMT = financial statement the type rolls into (BS = balance sheet, P&L = profit & loss).
NB = normal balance.

================================================================================
15 ACCOUNT TYPES in 5 GROUPS
================================================================================
GROUP: ASSET
  - Bank                          STMT=BS  NB=Debit   ACTION=View register
  - Accounts receivable (A/R)     STMT=BS  NB=Debit   ACTION=View register
  - Other Current Assets          STMT=BS  NB=Debit   ACTION=View register
  - Fixed Assets                  STMT=BS  NB=Debit   ACTION=View register
  - Other Assets                  STMT=BS  NB=Debit   ACTION=View register
GROUP: LIABILITY
  - Credit Card                   STMT=BS  NB=Credit  ACTION=View register
  - Accounts payable (A/P)        STMT=BS  NB=Credit  ACTION=View register
  - Other Current Liabilities     STMT=BS  NB=Credit  ACTION=View register
  - Long Term Liabilities         STMT=BS  NB=Credit  ACTION=View register
GROUP: EQUITY
  - Equity                        STMT=BS  NB=Credit  ACTION=View register
GROUP: INCOME
  - Income                        STMT=P&L NB=Credit  ACTION=Run report
  - Other Income                  STMT=P&L NB=Credit  ACTION=Run report
GROUP: EXPENSE
  - Cost of Goods Sold            STMT=P&L NB=Debit   ACTION=Run report
  - Expenses                      STMT=P&L NB=Debit   ACTION=Run report
  - Other Expense                 STMT=P&L NB=Debit   ACTION=Run report

================================================================================
DETAIL TYPES per ACCOUNT TYPE
================================================================================
Bank:
  Cash on hand | Checking | Money Market | Rents Held in Trust | Savings | Trust account

Accounts receivable (A/R):
  Accounts Receivable (A/R)

Other Current Assets:
  Allowance for Bad Debts | Assets Available for Sale | Development Costs | Employee Cash Advances |
  Inventory | Investment - Mortgage/Real Estate Loans | Investment - Tax-Exempt Securities |
  Investment - U.S. Government Obligations | Investments - Other | Loans To Officers | Loans to Others |
  Loans to Stockholders | Other Current Assets | Prepaid Expenses | Retainage | Undeposited Funds

Fixed Assets:
  Accumulated Amortization | Accumulated Depletion | Accumulated Depreciation | Buildings |
  Depletable Assets | Furniture & Fixtures | Intangible Assets | Land | Leasehold Improvements |
  Machinery & Equipment | Vehicles | Other fixed assets

Other Assets:
  Accumulated Amortization of Other Assets | Goodwill | Lease Buyout | Licenses | Organizational Costs |
  Other Long-term Assets | Security Deposits

Credit Card:
  Credit Card

Accounts payable (A/P):
  Accounts Payable (A/P)

Other Current Liabilities:
  Deferred Revenue | Direct Deposit Payable | Federal Income Tax Payable | Garnishments Payable |
  Insurance Payable | Line of Credit | Loan Payable | Other Current Liabilities | Payroll Clearing |
  Payroll Tax Payable | Prepaid Expenses Payable | Rents in trust - Liability | Sales Tax Payable |
  State/Local Income Tax Payable | Trust Accounts - Liabilities | Undistributed Tips

Long Term Liabilities:
  Notes Payable | Other Long Term Liabilities | Shareholder Notes Payable

Equity:
  Accumulated Adjustment | Common Stock | Estimated Taxes | Health Insurance Premium |
  Health Savings Account Contribution | Opening Balance Equity | Owner's Equity |
  Paid-In Capital or Surplus | Partner Contributions | Partner Distributions | Partner's Equity |
  Personal Expense | Personal Income | Preferred Stock | Retained Earnings | Treasury Stock

Income:
  Discounts/Refunds Given | Non-Profit Income | Other Primary Income | Sales of Product Income |
  Service/Fee Income | Unapplied Cash Payment Income

Other Income:
  Dividend Income | Interest Earned | Other Investment Income | Other Miscellaneous Income |
  Tax-Exempt Interest

Cost of Goods Sold:
  Cost of labor - COS | Equipment Rental - COS | Other Costs of Services - COS |
  Shipping, Freight & Delivery - COS | Supplies & Materials - COGS

Expenses:
  Advertising/Promotional | Auto | Bad Debts | Bank Charges | Charitable Contributions | Communication |
  Cost of Labor | Dues & subscriptions | Entertainment | Entertainment Meals | Equipment Rental |
  Finance costs | Insurance | Interest Paid | Legal & Professional Fees |
  Office/General Administrative Expenses | Other Business Expenses | Other Miscellaneous Service Cost |
  Payroll Expenses | Payroll Tax Expenses | Payroll Wage Expenses | Promotional Meals |
  Rent or Lease of Buildings | Repair & Maintenance | Shipping, Freight & Delivery | Supplies & Materials |
  Taxes Paid | Travel | Travel Meals | Unapplied Cash Bill Payment Expense | Utilities

Other Expense:
  Amortization | Depreciation | Exchange Gain or Loss | Gas And Fuel | Home Office Expense |
  Other Home Office Expenses | Other Miscellaneous Expense | Other Vehicle Expenses | Parking and Tolls |
  Penalties & Settlements | Vehicle | Vehicle Insurance | Vehicle Lease | Vehicle Loan |
  Vehicle Loan Interest | Vehicle Registration | Vehicle Repairs | Wash and Road Services

================================================================================
SEED SHAPE (suggested)
================================================================================
catalogs.account_types(
  id, code, name, group_label, statement ENUM('BS','P&L'), normal_balance ENUM('Debit','Credit'),
  default_action ENUM('view_register','run_report'), sort_order, is_active, created_at )
catalogs.detail_types(
  id, account_type_id FK, name, qbo_detail_type_name, sort_order, is_active, created_at )
Both: explicit GRANTs to ih35_app; idempotent seed (INSERT ... ON CONFLICT DO NOTHING).
