# Account Type & Detail Type Catalog — canonical (QBO parity)

Source: captured live from IH 35 Transportation LLC QBO + completed to the full QuickBooks US catalog.
Used to seed `catalogs.account_types` + `catalogs.detail_types` (Block CA-01).

LEGEND: STMT = financial statement the type rolls into (BS = balance sheet, P&L = profit & loss).
NB = normal balance. CODE = short key used in `catalogs.account_types.code`.

================================================================================
15 ACCOUNT TYPES in 5 GROUPS
================================================================================

| Code | Name                        | Group     | STMT | NB     | Action        | sort |
|------|-----------------------------|-----------|------|--------|---------------|------|
| BANK | Bank                        | ASSET     | BS   | Debit  | view_register |  10  |
| AR   | Accounts receivable (A/R)   | ASSET     | BS   | Debit  | view_register |  20  |
| OCA  | Other Current Assets        | ASSET     | BS   | Debit  | view_register |  30  |
| FA   | Fixed Assets                | ASSET     | BS   | Debit  | view_register |  40  |
| OA   | Other Assets                | ASSET     | BS   | Debit  | view_register |  50  |
| CC   | Credit Card                 | LIABILITY | BS   | Credit | view_register |  60  |
| AP   | Accounts payable (A/P)      | LIABILITY | BS   | Credit | view_register |  70  |
| OCL  | Other Current Liabilities   | LIABILITY | BS   | Credit | view_register |  80  |
| LTL  | Long Term Liabilities       | LIABILITY | BS   | Credit | view_register |  90  |
| EQ   | Equity                      | EQUITY    | BS   | Credit | view_register | 100  |
| INC  | Income                      | INCOME    | P&L  | Credit | run_report    | 110  |
| OINC | Other Income                | INCOME    | P&L  | Credit | run_report    | 120  |
| COGS | Cost of Goods Sold          | EXPENSE   | P&L  | Debit  | run_report    | 130  |
| EXP  | Expenses                    | EXPENSE   | P&L  | Debit  | run_report    | 140  |
| OEXP | Other Expense               | EXPENSE   | P&L  | Debit  | run_report    | 150  |

================================================================================
DETAIL TYPES per ACCOUNT TYPE
================================================================================

**Bank:**
Cash on hand | Checking | Money Market | Rents Held in Trust | Savings | Trust account

**Accounts receivable (A/R):**
Accounts Receivable (A/R)

**Other Current Assets:**
Allowance for Bad Debts | Assets Available for Sale | Development Costs | Employee Cash Advances |
Inventory | Investment - Mortgage/Real Estate Loans | Investment - Tax-Exempt Securities |
Investment - U.S. Government Obligations | Investments - Other | Loans To Officers | Loans to Others |
Loans to Stockholders | Other Current Assets | Prepaid Expenses | Retainage | Undeposited Funds

**Fixed Assets:**
Accumulated Amortization | Accumulated Depletion | Accumulated Depreciation | Buildings |
Depletable Assets | Furniture & Fixtures | Intangible Assets | Land | Leasehold Improvements |
Machinery & Equipment | Vehicles | Other fixed assets

**Other Assets:**
Accumulated Amortization of Other Assets | Goodwill | Lease Buyout | Licenses | Organizational Costs |
Other Long-term Assets | Security Deposits

**Credit Card:**
Credit Card

**Accounts payable (A/P):**
Accounts Payable (A/P)

**Other Current Liabilities:**
Deferred Revenue | Direct Deposit Payable | Federal Income Tax Payable | Garnishments Payable |
Insurance Payable | Line of Credit | Loan Payable | Other Current Liabilities | Payroll Clearing |
Payroll Tax Payable | Prepaid Expenses Payable | Rents in trust - Liability | Sales Tax Payable |
State/Local Income Tax Payable | Trust Accounts - Liabilities | Undistributed Tips

**Long Term Liabilities:**
Notes Payable | Other Long Term Liabilities | Shareholder Notes Payable

**Equity:**
Accumulated Adjustment | Common Stock | Estimated Taxes | Health Insurance Premium |
Health Savings Account Contribution | Opening Balance Equity | Owner's Equity |
Paid-In Capital or Surplus | Partner Contributions | Partner Distributions | Partner's Equity |
Personal Expense | Personal Income | Preferred Stock | Retained Earnings | Treasury Stock

**Income:**
Discounts/Refunds Given | Non-Profit Income | Other Primary Income | Sales of Product Income |
Service/Fee Income | Unapplied Cash Payment Income

**Other Income:**
Dividend Income | Interest Earned | Other Investment Income | Other Miscellaneous Income |
Tax-Exempt Interest

**Cost of Goods Sold:**
Cost of labor - COS | Equipment Rental - COS | Other Costs of Services - COS |
Shipping, Freight & Delivery - COS | Supplies & Materials - COGS

**Expenses:**
Advertising/Promotional | Auto | Bad Debts | Bank Charges | Charitable Contributions | Communication |
Cost of Labor | Dues & subscriptions | Entertainment | Entertainment Meals | Equipment Rental |
Finance costs | Insurance | Interest Paid | Legal & Professional Fees |
Office/General Administrative Expenses | Other Business Expenses | Other Miscellaneous Service Cost |
Payroll Expenses | Payroll Tax Expenses | Payroll Wage Expenses | Promotional Meals |
Rent or Lease of Buildings | Repair & Maintenance | Shipping, Freight & Delivery | Supplies & Materials |
Taxes Paid | Travel | Travel Meals | Unapplied Cash Bill Payment Expense | Utilities

**Other Expense:**
Amortization | Depreciation | Exchange Gain or Loss | Gas And Fuel | Home Office Expense |
Other Home Office Expenses | Other Miscellaneous Expense | Other Vehicle Expenses | Parking and Tolls |
Penalties & Settlements | Vehicle | Vehicle Insurance | Vehicle Lease | Vehicle Loan |
Vehicle Loan Interest | Vehicle Registration | Vehicle Repairs | Wash and Road Services
