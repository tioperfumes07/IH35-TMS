# IH35-TMS — QuickBooks Feature Parity Requirements

**Author:** Claude (consolidating May 1 design session + June 6 deep inspection)
**Date locked:** 2026-06-06
**Status:** CANONICAL REFERENCE
**Audience:** Cursor, future Claude sessions, Jorge

---

## 🎯 THE PARITY BAR

IH35-TMS must achieve **QuickBooks feature parity** for every financial module Jorge currently uses in QBO. "Parity" means:

1. **Same filters** — every list view has the same filter options as QBO
2. **Same functions** — add, edit, delete, duplicate, void, mark inactive work identically
3. **Same visibility** — same data fields shown, same column structures
4. **Same reports** — same report types with same filters and same layouts
5. **Same transaction look/feel** — invoices, bills, expenses, journal entries look like QBO equivalents
6. **Same modals** — edit boxes, new-entity modals match QBO patterns
7. **Same registers** — chart of accounts register matches QBO

**Plus TMS-specific extensions** that QBO doesn't have (driver settlements, IFTA, per-load profitability, telematics integration).

The standard: Jorge looking at IH35-TMS and QBO side-by-side should see the same patterns, same workflows, same trustworthy financial behavior.

---

## 🏗️ JORGE'S QBO COMPANY: IH 35 Transportation LLC (verified 2026-06-06)

```
Industry:         488510 (Freight Transportation Arrangement)
NAICS:            488510
Subscription:     QBO Plus + Payroll Core
Bankruptcy:       Chapter 11 DIP status
QBO OCI UUID:     91e0bf0a-133f-4ce8-a734-2586cfa66d96
QBO Company ID:   (separate for IH 35 Transportation LLC)

Scale today:
  - 477 vendors
  - 147 customers (with active balances)
  - ~150+ products/services (chart of account leaf items)
  - 200+ open bills, ~$220K due
  - 8 W-2 employees (5 active)
  - 32 trucks operating
  - Multi-currency exposure (USD primary, MXN operations)
  - Multi-location (Laredo TX + Nuevo Laredo MX + Colombia NL)
```

---

## 📋 MODULE-BY-MODULE PARITY REQUIREMENTS

### MODULE 1: CHART OF ACCOUNTS (foundational)

**QBO has:**
- Hierarchical accounts (parent → child) with type, detail type, balance
- Register view per account (running balance, all transactions)
- Edit modal: name, type, detail type, parent, description, opening balance, currency, tax line
- "Make inactive" toggle (soft delete)
- Filter by: type, detail type, active/inactive, currency
- Search by name
- Sort by name, type, balance
- New account modal with smart defaults based on type
- Reorder children under parent

**IH35-TMS needs:**
```
ROUTE: /accounting/chart-of-accounts

LIST VIEW:
  Columns: Name | Type | Detail Type | Currency | Balance | Status
  Filters:
    □ Active only (default checked)
    □ Show inactive
    Type: [All ▼] (Asset / Liability / Equity / Income / Expense / COGS / Other)
    Detail Type: [filtered by parent type]
    Currency: [All ▼]
  Search: by name
  Sort: clickable column headers
  Actions: + New Account | Make Inactive | Edit | Delete

REGISTER VIEW (click account name):
  Top row: Account name | Current balance | [+ New transaction]
  Filters: date range | transaction type | status (cleared/reconciled)
  Columns: Date | Type | Num | Name | Memo | Decrease | Increase | Balance
  Running balance updates
  Click any row → opens edit modal for that transaction
  Reconcile button (top right)

EDIT MODAL (Edit Account):
  Name *
  Account Type * [dropdown]
  Detail Type * [dropdown, filtered by Type]
  Currency [dropdown]
  Description
  Sub-account of [searchable dropdown, optional]
  When to use this account [tooltip help]
  Opening Balance [editable until first transaction]
  Tax line [for tax reporting]
  Default tax code [for items defaulting]
  Is sub-account? [toggle]
  is_active [toggle — QuickBooks soft-delete pattern]
  
  Buttons: Save and New | Save and Close | Cancel

NEW ACCOUNT MODAL:
  Same as edit, but with smart defaults:
  - Selecting "Bank" type → shows: routing #, account #, last reconciled
  - Selecting "Credit Card" → shows credit limit
  - Selecting "Accounts Receivable" → only one allowed per currency
  - Selecting "Accounts Payable" → only one allowed per currency
  - Selecting "Fixed Asset" → shows: depreciation method, useful life,
    salvage value, accumulated depreciation account
```

### MODULE 2: CUSTOMERS

**QBO has:**
- Customer list with: name, company, phone, email, balance, status
- Customer profile: contact info, addresses, payment terms, tax info, notes, attachments
- Transaction list per customer: invoices, payments, credits, refunds
- Statement view
- "Make inactive" + reactivate
- Filter by: status, type, recent activity, overdue
- Bulk actions: send statements, create batch invoices

**IH35-TMS needs:**
```
ROUTE: /customers

LIST VIEW:
  Columns: Customer | Company | Phone | Email | Open Balance | Overdue | Status
  Filters:
    □ Active only (default)
    □ With overdue balance
    □ With open balance
  Search: name/company
  Bulk actions: send statements, send batch invoices, mark inactive

PROFILE VIEW (click customer):
  Tabs: 
    [Transactions] - all invoices/payments/credits, filterable by date/type/status
    [Customer Details] - addresses, contacts, tax info, notes, attachments
    [Statements] - generate, view, send
    [Loads] (TMS extension) - all loads for this customer, with status
    [Per-Customer P&L] (TMS extension) - revenue, costs, margin

EDIT MODAL:
  - Customer name *
  - Company name
  - Display name * (auto-populated)
  - Phone, fax, mobile, other phone, email
  - Website
  - Billing address (street, city, state, ZIP, country)
  - Shipping address (with "Same as billing" toggle)
  - Payment terms [dropdown: from QBO term list]
  - Currency
  - Tax: taxable? tax code? resale number?
  - Notes (internal)
  - Attachments (W-9, signed contracts)
  - is_active toggle
  - Parent customer (for sub-customers / jobs)
  
  Buttons: Save and New | Save and Close | Cancel
```

### MODULE 3: VENDORS

**QBO has:**
- Vendor list with: name, phone, email, open balance, 1099 status
- Vendor profile: contact info, tax info (W-9, TIN), payment terms, default expense account
- Bill list per vendor, payment list, credit list
- 1099 contractor toggle + W-9 collection
- "Make inactive" + reactivate
- Filter by: status, 1099 eligible, has open balance, has bills overdue

**IH35-TMS needs:**
```
ROUTE: /vendors

LIST VIEW:
  Columns: Vendor | Phone | Email | Open Balance | Overdue | 1099? | Status
  Filters:
    □ Active only (default)
    □ 1099 eligible
    □ With open balance
    □ Overdue
  Search: name/company

PROFILE VIEW (click vendor):
  Tabs:
    [Transactions] - bills, payments, credits, expenses
    [Vendor Details] - contact, tax info, payment terms, default account
    [W-9 / 1099 Status] - TIN, W-9 on file, 1099 amounts YTD
    [Maintenance History] (TMS extension) - if mechanic vendor

EDIT MODAL:
  - Vendor name *
  - Company name
  - Phone, email, fax, website
  - Address (street, city, state, ZIP)
  - Tax info:
    □ Track for 1099
    Federal TIN (EIN or SSN)
    W-9 on file? [toggle + upload]
    Tax classification (sole prop, LLC, corp, etc.)
  - Payment terms [dropdown]
  - Default expense account [dropdown — for autofill on bills]
  - Currency
  - Notes
  - Attachments (W-9, insurance, contracts)
  - is_active toggle

VENDOR TYPES (custom categorization for trucking):
  - Mechanic shop (external)
  - Mechanic shop (internal — for cost allocation)
  - Fuel card provider (ComData, Relay)
  - Factor (Faro Factoring, etc.)
  - Insurance broker
  - Software vendor
  - Office vendor
  - Permit / regulatory vendor
  - Independent contractor driver (1099)
  - Other
```

### MODULE 4: ITEMS / PRODUCTS / SERVICES

**QBO has:**
- Hierarchical items (parent → child)
- Types: Service, Inventory, Non-inventory, Bundle
- Edit modal: name, SKU, description (sales + purchase), price, cost, account mapping
- Sales income account
- Purchase expense account / COGS account
- Inventory tracking (qty on hand, reorder point)
- Tax: taxable, tax code
- "Make inactive" + reactivate

**IH35-TMS needs:**
```
ROUTE: /items (or under /lists/items)

LIST VIEW:
  Columns: Item | Type | SKU | Sales Price | Purchase Price | Qty | Status
  Filters:
    □ Active only (default)
    Type: [All ▼] (Service / Inventory / Non-inventory / Bundle)
    Account: [searchable dropdown]
  Search: name/SKU
  Sort: clickable

EDIT MODAL (matches QBO exactly):
  - Name *
  - Type * (Service / Inventory / Non-inventory / Bundle)
  - SKU
  - Sub-item of [searchable dropdown, optional]
  - Sales information:
    □ I sell this product/service
    Description on sales forms
    Sales price/rate
    Income account [dropdown]
    Taxable? [toggle]
    Tax code
  - Purchase information:
    □ I purchase this product/service
    Description on purchase forms
    Cost
    Expense account or COGS account [dropdown]
    Preferred vendor
  - Inventory (if Inventory type):
    Initial quantity on hand
    As of date
    Reorder point
    Asset account
  - is_active toggle
  
  Buttons: Save and New | Save and Close | Cancel

TRUCKING-SPECIFIC ITEMS already in your QBO (preserve hierarchy):
  Revenue items:
    Sales of Service Income:Line Haul
    Sales of Service Income:Fuel Surcharge
    Sales of Service Income:Detention Charge
    Sales of Service Income:Layover Charge
    Sales of Service Income:Lumper Fee
    Sales of Service Income:Sales-Transload
    Sales of Service Income:Extra Delivery-Pick/Drop
    Sales of Service Income:Sales-International Border Crossing
    Sales of Service Income:Sales-Escort Expense
    Sales of Service Income:Sales-Local Movement
    Sales of Service Income:Shag Fee
    Sales of Service Income:Sales-Permit Fee Expense
    Sales of Service Income:Customer Expense-Reefer-Trailer-Washout
    Sales of Service Income:Customer Pmt-Fuel Advance
    Sales of Service Income:Deduction-For Damaged Product (negative)
    Sales of Service Income:Deduction-Charge for Damages (negative)
    Sales of Service Income:Deduction-Company Fine-For Late Delivery
    
  Driver pay items (Driver Salaries:):
    Driver Pay-CDL-Empty Miles
    Driver Pay-CDL-Loaded Miles
    Driver Pay-Mexico-B1 Driver-Empty Miles
    Driver Pay-Mexico-B1 Driver-Loaded Miles
    Driver Pay-Layover-Estancia
    Driver Pay-Bonus
    Driver Pay-Tarp-Enlonada/Desenlonada
    Driver Pay-Local Movement
    Driver Pay-Oversize Load
    Driver Pay-Extra Pick/Delivery-Drop
    Driver Pay-Extra for Repairs-Maintenance
    Petty Cash Advance-Caja Chica
    
  Driver deductions (Driver Deductions:):
    Driver Deduction-Escrow for Claims-2026 ⭐
    Driver Deduction-Express Code Fee
    Driver Deduction-Fines & Violations
    Driver Deduction-I-94 Permit
    Driver Deduction-Wire & ACH Fee
    Driver Deduction-Fine-Late Delivery Fee
    Driver Deduction-For Accident & Damages to Equipment
    Driver Deduction-Meals
    Driver-Deductions-Miscellaneous
    Driver Deduction-Personal Expenses-Telephone, etc

  [... full hierarchy in QBO inspection data]
```

### MODULE 5: BILLS (Vendor Bills)

**QBO has:**
- Bill form: vendor, mailing/billing address, terms, date, due date, bill #, memo
- Category details (account lines) + Item details (product lines)
- Attachments (PDF of vendor bill)
- Status: Open / Paid / Partially Paid / Overdue / Void
- Recurring bills
- "Make Payment" workflow → schedules payment, prints check, records bill payment

**IH35-TMS needs:**
```
ROUTE: /bills

LIST VIEW:
  Columns: Date | Bill # | Vendor | Memo | Amount | Open Balance | Status | Due
  Filters:
    □ Status: All / Open / Overdue / Paid / Void
    □ Date range
    □ Vendor [searchable]
    □ Has attachment
    □ Recurring only
  Search: bill #, memo, vendor
  Sort: clickable
  Bulk actions: Mark as paid, Send batch payment, Export
  Visual badges: 🟠 Overdue, 🟡 Due soon (next 7 days), 🟢 Paid

BILL FORM:
  Header:
    Vendor * [searchable dropdown]
    Mailing address [auto-fills from vendor]
    Terms [auto-fills from vendor, can override]
    Bill date *
    Due date * [auto-calc from terms]
    Bill # (vendor's invoice number)
    Memo
  
  Category details tab (account-based):
    Account | Description | Amount | Class | Project | Customer/Job
    [+ Add line]
  
  Item details tab (item-based):
    Item | Description | Qty | Rate | Amount | Class | Project
    [+ Add line]
  
  Attachments [drag-drop or upload]
  
  Total | Subtotal | Sales tax (if applicable)
  
  Buttons: Save | Save and Close | Save and New | Make Payment

EDIT MODE: full bill loads, all fields editable until paid
PAID BILLS: read-only with "Void" button (creates void)

TMS EXTENSIONS:
  - Auto-categorize repair bills to specific units (Unit field on each line)
  - Auto-categorize fuel bills with driver assignment
  - Link bill to load (for per-load profitability)
  - Auto-detect overlap with Relay/ComData fuel card transactions
  - "Bill came from email" auto-import from attached PDFs
```

### MODULE 6: INVOICES (Customer Invoices)

**QBO has:**
- Invoice form: customer, billing/shipping address, terms, date, due date, invoice #
- Line items with quantity, rate, amount, tax
- Attachments (BOL, POD, supporting docs)
- Status: Open / Paid / Partial / Overdue / Void
- Sent / Viewed tracking (when emailed)
- Recurring invoices
- "Receive Payment" workflow

**IH35-TMS needs:**
```
ROUTE: /invoices

LIST VIEW:
  Columns: Date | Invoice # | Customer | Load # | Memo | Amount | Balance | Status | Due
  Filters:
    □ Status: All / Open / Overdue / Paid / Sent / Viewed / Not Sent
    □ Date range
    □ Customer
    □ With balance
    □ Factored vs Non-factored ⭐ TMS-specific
  Search
  Sort

INVOICE FORM:
  Header:
    Customer * [searchable]
    Email [auto-fills, editable]
    Billing/Shipping address
    Terms [auto-fills, override]
    Invoice date *
    Due date * [auto-calc]
    Invoice # [auto-generated, editable]
    PO number [optional]
    
  Line items:
    Product/Service | Description | Qty | Rate | Amount | Tax
    [+ Add line]
    [+ Add subtotal]
    [+ Add discount line]
  
  Footer:
    Message on invoice
    Memo (internal)
    Discount (% or $)
    Sales tax
    Total | Balance due
  
  Attachments [BOL, POD, receipts]
  
  Buttons: Save | Save and Send | Save and Close | Save and New
  
TMS EXTENSIONS:
  - Auto-populate from load: revenue line + accessorials
  - "Factor this invoice" button → links to factoring workflow
  - Link to load (for company settlement report)
  - Multi-line for fuel surcharge, detention, lumper, etc.
  - Per-stop invoicing (multi-pick or multi-drop loads)
```

### MODULE 7: EXPENSES (non-bill)

**QBO has:**
- Expense form: payment account, payee, payment date, payment method
- Category details + Item details
- Attachments
- Bank vs credit card vs cash distinction
- Status: Cleared / Reviewed / Unreviewed

**IH35-TMS needs:**
```
ROUTE: /expenses

LIST VIEW:
  Columns: Date | Payee | Account | Category | Amount | Status | Memo
  Filters:
    □ Date range
    □ Account [bank/card]
    □ Payee
    □ Category (account)
    □ Status: cleared/uncleared/reviewed/unreviewed
  Search

EXPENSE FORM:
  Header:
    Payment account * (bank or credit card)
    Payee [searchable vendor]
    Payment date *
    Payment method (check, EFT, cash, debit, etc.)
    Reference # (check #, EFT confirmation)
    Memo
  
  Category details:
    Account | Description | Amount | Class | Project | Customer | Unit
    
  Item details: (if applicable)
  
  Attachments
  
  Buttons: Save | Save and Close | Save and New

TMS EXTENSIONS:
  - "Unit" field on every line (which truck this expense is for)
  - Auto-import from ComData/Relay fuel card transactions
  - Auto-categorize based on vendor + amount patterns
  - Driver fuel submissions become expenses after approval
```

### MODULE 8: BANKING (referenced from May 1 design)

**Already designed in May session — preserve all of:**

```
ROUTE: /banking

BANKING HOME — Horizontal account tiles:
  ALL tiles in ONE single horizontal row, left to right, scrollable.
  Each tile (200px × 90px):
    Account name (bold, 13px, truncate)
    Account type label (gray)
    Balance (bold blue, 18px) or red if negative
    Uncategorized badge (orange) if > 0
  Active tile: blue bottom border
  Click → loads register INLINE BELOW the tile row
  
SYNC BANNER above tiles:
  🔄 Last synced from QuickBooks: 2 min ago
  847 transactions | 23 uncategorized
  [Sync Now] [Sync Full History] [Manage Accounts] [Import Statement]

BANKING SIDEBAR (replaces maintenance sidebar):
  - DIP Accounts (home)
  - Uncategorized Queue
  - Rules
  - Reconciliation
  - Relay Transactions
  - Driver Settlements
  - Factoring
  - Import History
  
  HIDDEN when in Banking: Board, Fleet by Type, Shop Status, Services, Settings

REGISTER VIEW (inline below tile row):
  Columns: Date | Type | Description | Payee | Memo | Decrease | Increase | Balance | QBO Status
  Filters: from, to, status, type
  Actions: + New Transaction | Reconcile | Export

UNCATEGORIZED QUEUE:
  Oldest first
  Each row: Date | Description | Amount | [Categorize] button
  Bulk: Apply rule to all matching
  
RULES ENGINE:
  Pattern matching on description / amount / account
  Auto-categorize matching transactions
  Review queue before final commit
```

### MODULE 9: REPORTS — FULL QBO MIRROR + TMS EXTENSIONS

**Already designed in May session — preserve all of:**

```
QBO REPORTS (mirror exactly — same numbers, same filters, same layouts):

Financial Reports:
  - Profit & Loss (Cash basis)
  - Profit & Loss (Accrual basis)
  - Profit & Loss Detail
  - Profit & Loss by Class (per truck)
  - Profit & Loss by Customer
  - Profit & Loss by Month (12-month comparison)
  - Balance Sheet
  - Balance Sheet Detail
  - Balance Sheet by Class
  - Trial Balance
  - General Ledger
  - Statement of Cash Flows
  - Transaction List by Date
  - Transaction Detail by Account
  
A/R Reports:
  - A/R Aging Summary
  - A/R Aging Detail
  - Customer Balance Summary / Detail
  - Open Invoices
  - Invoice List
  - Statement List
  - Collections Report
  
A/P Reports:
  - A/P Aging Summary
  - A/P Aging Detail
  - Vendor Balance Summary / Detail
  - Unpaid Bills
  - Bill Payment List
  - Check Detail
  
Sales Reports:
  - Sales by Customer Summary / Detail
  - Sales by Product/Service Summary / Detail
  - Sales by Class
  - Income by Customer Summary
  
Expense Reports:
  - Expenses by Vendor
  - Expenses by Account
  - Purchases by Product/Service
  - Sales Tax Liability

Banking Reports:
  - Check Register
  - Bank Reconciliation Report
  - Deposit Detail
  - Missing Checks

REPORT VIEWER UI (every report):
  Top: Title | Date range | Customize | Save customization | Send by email | Export
  Filters sidebar: same options QBO uses
  Drill-down: click any number to see source transactions
  Export: PDF, Excel, CSV
  Custom date ranges: This month, Last month, This quarter, Last quarter, 
                     This year, Last year, YTD, Custom range
  Comparison: vs last period, vs last year, % change
  Save customizations: named saved reports per user
  Email: PDF auto-sent on schedule

TMS-SPECIFIC REPORTS (QBO cannot do these):
  - COMPANY SETTLEMENT REPORT (per load) ⭐ JORGE'S TERMINOLOGY
    Per load/trip, rolls up ALL related transactions:
      Revenue: invoices for this load (line haul, fuel surcharge, 
               detention, layover, lumper, escort, etc.)
      Driver Pay: all driver pay items (loaded miles, empty miles, 
                  tarp, layover, accessorials)
      Driver Deductions: all deductions for this load
      Fuel: all fuel transactions during this trip
      Repairs: any maintenance during the load
      Tolls: bridge + highway (USA + Mexico)
      Permits: oversize, state-specific
      Escort costs (if oversize)
      Lumper/warehouse expense
      Scale expense
      Manifests/cross-border docs
      Factoring fees (if factored)
      → NET PROFIT on this trip
      → ROI per mile
    Filterable by: driver, unit, date range, customer, load #, status
    
  - DRIVER SETTLEMENT REPORT
    Per driver per period:
      Gross earned: empty miles + loaded miles + accessorials
      Deductions: fuel, advances, fines, escrow contribution, misc
      Net paid: gross - deductions
      Balance owed
      Year-to-date totals
      Settlement statement PDF (driver-facing)
    
  - FUEL REPORT (IFTA-ready)
    By unit / driver / state:
      Miles driven per state
      Gallons purchased per state
      MPG by unit, by month
      Fuel cost per loaded mile
      IFTA tax calculation prep
    
  - FACTORING REPORT
    Total invoiced vs total advanced vs total fees
    Net cash from factoring
    Outstanding invoices not yet factored
    Factor reserve balance
    
  - LOAD-LEVEL P&L (same as Company Settlement Report)
  
  - DRIVER ESCROW LEDGER ⭐ JORGE PRIORITY
    Per driver:
      Deposits (weekly deductions)
      Withdrawals (claim payouts)
      Current balance
      Year-end rollover
      Termination payout calculation
    Total escrow GL account balance
    Reconciliation: sum of per-driver = GL balance
    
  - 425C MONTHLY OPERATING REPORT (Ch11 DIP)
    Auto-populated from banking:
      Line 19: Opening cash (all DIP accounts)
      Line 20: Total cash receipts
      Line 21: Total cash disbursements
      Line 22: Net cash flow
      Line 23: Ending cash balance
    One-click "Import from Banking" → fills these lines automatically
    Also fills Part 7 Column B (actual vs projected)
    
  - PER-CUSTOMER P&L
    Revenue from customer
    Costs allocated to customer's loads
    Customer profitability
    Top customers by margin
    
  - PER-DRIVER P&L
    Revenue from driver's loads
    Driver pay + costs
    Driver-level profitability
    
  - PER-UNIT P&L
    Revenue per truck
    All costs allocated to that truck
    Cost per mile
    Truck-level ROI
```

### MODULE 10: LISTS (everything Jorge called out)

**QBO has the following lists:**

```
LISTS IN QBO:
  - Chart of Accounts
  - Customers
  - Vendors
  - Employees
  - Products and Services (Items)
  - Classes (you use per truck/trailer)
  - Locations (Laredo TX, Nuevo Laredo, Colombia)
  - Terms (Net 15, Net 30, Due on receipt, etc.)
  - Tax Codes
  - Tax Agencies
  - Tax Rates
  - Payment Methods (Cash, Check, Visa, etc.)
  - Attachments
  - Recurring Templates
  - Custom Fields
  - Departments
  
EVERY LIST in IH35-TMS needs:
  ✅ Filter dropdown: Active / Inactive / All (default Active)
  ✅ Search bar
  ✅ Sortable columns
  ✅ + New button (opens add modal)
  ✅ Edit button on each row (opens edit modal)
  ✅ Mark Inactive / Make Active toggle
  ✅ Bulk actions (mark inactive, export, print)
  ✅ Export: CSV, Excel, PDF
  ✅ Audit log: who created, who edited, when
  
  Common universal patterns (apply to ALL lists):
  
  LIST HEADER:
    Title | Count (e.g., "147 Vendors") | Filter chips | + New | More actions ▼
  
  FILTER ROW:
    [Active ▼] [Search...] [Type filter ▼] [Other filters...]
  
  COLUMN HEADER:
    Sortable arrows, sticky on scroll
    Right-click → "Show/hide columns" menu
  
  ROW:
    Hover state with edit/delete icons
    Click row → open detail or edit modal
    Checkbox → bulk selection
    Status badge (Active/Inactive)
  
  PAGINATION:
    Page size selector (25, 50, 100, 250)
    Page navigation
    "Showing 1-25 of 147" indicator
```

---

## 🔁 UNIVERSAL UI PATTERNS (apply everywhere)

### Edit Modal Pattern (consistent across all entities)

```
ALL EDIT MODALS share this structure:

┌─────────────────────────────────────────┐
│ [Title]                            [×]  │
├─────────────────────────────────────────┤
│                                          │
│   [Fields - grouped by section]          │
│   * = required                            │
│                                          │
│   [Section: Tax info]                     │
│   [Section: Payment info]                 │
│                                          │
├─────────────────────────────────────────┤
│ [is_active toggle] [Mark Inactive btn]   │
│                                          │
│ [Cancel] [Save and New] [Save and Close] │
└─────────────────────────────────────────┘

Behavior:
  - ESC key = Cancel
  - Cmd+S = Save and Close
  - Tab navigation through fields
  - Save and New = saves + clears for next entry
  - Save and Close = saves + closes modal
  - Cancel with unsaved changes = confirmation dialog
  - Real-time validation (red border on invalid fields)
  - Server validation errors displayed inline
```

### New Entity Modal Pattern

```
NEW MODAL same as Edit Modal but:
  - Title says "New [Entity]"
  - All fields empty (or with smart defaults)
  - is_active defaults to true
  - Required fields highlighted
  - Helper text expanded
  - "Save and New" emphasized for batch entry
```

### Transaction Form Pattern

```
ALL TRANSACTION FORMS (invoices, bills, expenses, journal entries):

  ┌──────────────────────────────────────────┐
  │ [Type] [Number]              [Status]   │
  ├──────────────────────────────────────────┤
  │ HEADER: Customer/Vendor, Date, Terms     │
  │ ─────────────────────────────────────    │
  │ LINE ITEMS: Account | Desc | Amount | … │
  │                                           │
  │ [+ Add line]                              │
  │ ─────────────────────────────────────    │
  │ Subtotal: $X.XX                          │
  │ Tax: $X.XX                                │
  │ TOTAL: $X.XX                              │
  │ ─────────────────────────────────────    │
  │ ATTACHMENTS: [drag-drop or browse]       │
  │ MEMO: [internal notes]                   │
  ├──────────────────────────────────────────┤
  │ [Cancel] [Save] [Save and Send] [More ▼] │
  └──────────────────────────────────────────┘
```

### Universal Filter Pattern

```
EVERY LIST has these filter behaviors:

  Top of list:
    [Active ▼] [Search...] [Date range ▼] [Type ▼] [More filters ▼]
    
  Filter chips when active:
    "Active: Yes ✕" "Date: Last 30 days ✕" "Type: Bills ✕"
    [Clear all filters]
  
  Saved filter sets:
    Per-user named filter combinations
    Default filter on landing
    "My overdue bills" → saved filter set
  
  Export respects current filters:
    Excel/CSV/PDF only includes filtered rows
```

---

## 🚛 TMS-SPECIFIC EXTENSIONS (where IH35-TMS exceeds QBO)

These are competitive advantages IH35-TMS will have that QBO does not:

```
1. DRIVER SETTLEMENTS
   Linked to specific loads, with all deductions traced to source transactions
   
2. PER-LOAD COMPANY SETTLEMENT REPORT ⭐ (Jorge's terminology)
   Every transaction touching a load rolled up into one statement
   
3. IFTA REPORTING
   Miles by state, gallons by state, quarterly filing prep
   
4. FACTORING WORKFLOW
   Factor advances detected in banking, linked to invoices, fees tracked
   
5. TELEMATICS INTEGRATION (Samsara)
   Real-time GPS, fuel level, engine faults → auto-WO creation
   
6. FUEL CARD INTEGRATION (ComData + Relay)
   Auto-import transactions → drivers → units → IFTA → settlements
   
7. DRIVER MOBILE APP (PWA)
   Drivers submit fuel, expenses, damage, time-off from phone
   
8. EQUIPMENT/UNIT ALLOCATION
   Every transaction can be tagged to a specific truck/trailer
   
9. MEXICO OPERATIONS PARALLEL STACK
   Mexico-B1 driver pay, MX permits, MX tolls, MX maintenance
   
10. CROSS-BORDER DOCUMENT MANAGEMENT
    Manifests, cruces, BOL handling for international shipments
    
11. DRIVER ESCROW LEDGER ⭐
    Per-driver claim escrow accounting
    
12. COMPLIANCE INTEGRATION
    CSA scores, drug/alcohol, DOT inspections, HOS, ELD audit trails
```

---

## 📁 MAY 1 DESIGN SESSION — PRESERVED ELEMENTS

These were designed in the May 1 session and remain canonical:

```
PRESERVED FROM MAY 1:
  ✅ Banking module with horizontal account tiles (QBO-style)
  ✅ Sync banner (Last synced from QuickBooks, Sync Now, Sync Full History)
  ✅ Inline register below tile row (not new page, not modal)
  ✅ Banking-only sidebar (hides Board, Fleet by Type, Shop Status, Services, Settings)
  ✅ Account categorization workflow (uncategorized queue)
  ✅ Rules engine for auto-categorization
  ✅ Form 425C auto-population from banking (lines 19-23)
  ✅ Driver Settlements module design (gross, deductions, net, period, status)
  ✅ Factoring workflow (advance detection, fee tracking, reconciliation)
  ✅ Reports mirror (all QBO reports + TMS extensions)
  ✅ Relay fuel card integration design
  ✅ Expense mapping system (driver fuel types → QBO accounts/items)
  ✅ Two-entity handling (IH 35 Transportation + IH 35 Trucking)
  ✅ Search palette (commands + features + data)
  ✅ Fleet Reports Hub (read-only mirror of maintenance.html)
  ✅ Equipment assignments tracking
  ✅ QBO catalog cache + sync queue
  ✅ Auto-retry every 15 minutes when QBO reconnects
  
THESE MUST BE PRESERVED in current GAP block design. If any 
GAP block contradicts these, the GAP block is wrong, not the May 1 design.
```

---

## 🎯 EXECUTION SEQUENCE

### Phase 1: Foundation (Tier 1 trust blocks)
Before any of the above ships:
- GAP-OBSERV-FOUNDATION (see what's working)
- GAP-IDEMP-KEYS (no duplicate writes)
- GAP-DOUBLE-ENTRY-DB-ENFORCEMENT
- GAP-PERIOD-LOCK-DB-LEVEL
- GAP-FINANCIAL-RECONCILIATION
- GAP-ACTIVE-INACTIVE-STANDARDIZATION ⭐ (universal soft-delete)

### Phase 2: QBO Parity Core (slot in next)
- Chart of Accounts + Register (with register view, edit modal, soft-delete)
- Customers (mirror QBO patterns)
- Vendors (with 1099 support)
- Items / Products / Services (preserve current QBO hierarchy)
- Bills (with TMS extensions: unit field, load link)
- Invoices (with TMS extensions: load auto-population, factor button)
- Expenses (with unit field)
- Banking (use May 1 design — horizontal tiles, inline register)

### Phase 3: Reports (QBO mirror + TMS extensions)
- All QBO reports listed above
- Plus TMS-specific reports (Company Settlement Report, IFTA, etc.)

### Phase 4: TMS-Specific Extensions
- Driver Settlements full workflow
- Factoring workflow
- Fuel card integrations
- Driver mobile app polish
- Mexico operations module

### Phase 5: Financial Completeness (from QBO inspection)
- GAP-FIXED-ASSETS-DEPRECIATION
- GAP-DRIVER-ESCROW-LEDGER
- GAP-IFTA-REPORTING
- GAP-1099-ANNUAL-REPORTING
- GAP-MULTI-COMPANY-CONSOLIDATION

---

## 🔄 MAINTAINING THIS DOCUMENT

This document is **the canonical reference** for QBO parity. Update protocol:

1. When new QBO patterns are discovered → add to relevant module section
2. When IH35-TMS implements a pattern → mark as "Implemented" with PR reference
3. When pattern changes → version bump, note change rationale
4. When Cursor deviates → either update doc (new requirement) or fix Cursor (regression)

**Storage location:** `docs/trackers/QBO-FEATURE-PARITY-REQUIREMENTS.md` in canonical repo

**Cross-references:**
- `docs/trackers/SAFETY-TRUST-RECOMMENDATIONS.md` — trust-layer infrastructure
- `docs/trackers/phase-2.md` — current GAP block tracker
- `docs/specs/*` — per-block detailed specs

**Reviewers:** Jorge for any changes, Claude/Cursor execute

---

## 📌 FINAL NOTE ON METHODOLOGY

Jorge correctly identified that this inspection should have been hardwired since May. Going forward:

```
EVERY MAJOR DESIGN DISCUSSION must produce:
  1. A permanent document in the repo (not just chat transcript)
  2. Updated in docs/trackers/
  3. Referenced from related GAP blocks
  4. Committed via the standard branch/PR/merge flow

NO MORE chat-only design. The design lives in code+docs that survive sessions.
```

---

**Document version:** 1.0 (2026-06-06)
**Locked by:** Jorge Pablo Munoz
**Created in response to:** "you had done this previously, it should have been hardwired and saved"
**Will be committed to:** `docs/trackers/QBO-FEATURE-PARITY-REQUIREMENTS.md`
