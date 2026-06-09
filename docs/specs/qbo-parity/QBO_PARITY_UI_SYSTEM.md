# QBO-PARITY UI SYSTEM — Full Design Capture (Design Law)

**Task:** QBO-PARITY-UI-SYSTEM — Mirror QuickBooks accounting/catalog UI (additive)
**Captured live from:** QBO IH35 Transportation, 2026-06-08
**Status:** design law for these screens. Build is additive; financial-cluster pieces are GATED (see push policy).

> **Push policy for builds from this spec:** the docs + non-financial UI scaffolding MAY self-merge when green+clean. ANY change touching `accounting.*` / `catalogs.accounts` schema / posting / balances / periods / reconcile-commit / reclassify-apply = **financial cluster = policy (i)**: branch, `tsc -b` + migration locally, show Jorge diff + live verification, WAIT for explicit OK. When unsure if financial, STOP and ask.

> **Absolute rules:** ADDITIVE-ONLY (never delete/remove/reorder existing modules/pages/sidebar/columns/fields/tabs/routes; ARCHIVE never DELETE; sole exception: Jorge says "remove X"). Vocab **"+ Create" / "+ Book"**, never "+ New / + Add". Schema = `accounting.*` (never `finance.*`), audit = `audit.row_changes`, reuse EXISTING posting/GL funcs — NO new GL math. RLS: `SET app.operating_company_id` before every accounting/catalogs read or counts lie. KEEP existing TMS trucking custom fields + lock-account control. Every bug fix gets a static CI guard.

---

## PART A — WHAT TO BUILD: shared "QBO Parity UI System"

Build ONE shared system, apply additively across accounting + catalog pages. Do NOT rebuild pages that exist — restructure them to consume these shared components.

### A1) UNIVERSAL TABLE GRAMMAR (one shared component, used by every data table)
- **Filter dropdowns row:** Type/Transaction-type · Status · Date-range (+ context filters: Category, Class, Location). Each filter's option list per the page specs in PART B.
- **Right toolbar:** Print · Export (to Excel/CSV) · Table-settings GEAR · More actions.
- **GEAR popover:** column show/hide checklist + DENSITY toggle (Regular · Compact · Ultra compact) + "Save as default".
- **Multiselect:** header select-all checkbox + per-row checkboxes → Batch-actions bar.
- **Pager:** prev/next arrows + numbered page buttons + type-a-page input + "N–M of TOTAL" + per-page count selector. (QBO uses 300/page on banking; make per-page configurable.)
- **Row action menu (3-dots):** View/Edit · Print · context actions.
- **Density target:** dense rows, content-width columns (NOT stretched), fixed-width summary panels. This is the fix for "TMS too wide/too large."

### A2) INLINE "+ ADD NEW" — GLOBAL, EVERY DROPDOWN, EVERY MODULE
Every reference dropdown (Category, Class, Income/Expense account, Payee, Vendor, Customer, Item, Terms, Payment method, Location) ends with a sticky **"+ Add new ___"** that opens an inline mini-create WITHOUT closing the parent panel; on save returns with the new value selected. Account dropdowns ALSO keep the existing TMS **lock-account** control (add inline +Add alongside, do not replace).
- **[TODO capture]** exact inline +Add mini-form chrome — open a dropdown's +Add in live QBO, save to spec file.

### A3) SIZING SYSTEM (measured live)
- **Create/EDIT side panels** (item, customer, vendor, account) = bounded RIGHT DRAWER **≈ 576–582px (~29–30% of viewport)**. Single column, compact ~36–40px fields. NOT full-bleed.
- **Forms like New Customer** = centered bounded modal card (~700–800px), sectioned.
- **TRANSACTION EDITORS** (Expense/Bill/Check/Invoice/etc.) = **FULL-PAGE** (the exception). Dense line grids.
- **Match/reconcile summary bars** = sticky bottom bar.

---

## PART B — THE CAPTURED SCREENS (live from QBO IH35 Transportation, 2026-06-08)

### B1) PRODUCTS & SERVICES (`/app/items`)
- **List columns (14):** Name · Sales description · Qty on hand · Category · SKU · Type · Price · Cost · Income account · Expense account · Inventory account · Purchase description · Reorder point · Actions
- **"+ Create"** → type picker: Service · Inventory item · Non-inventory item · Bundle · Batch import · Import from sales channel
- **TWO-MODE item:** (a) full-page Details view (read, per-section Edit); (b) edit SLIDE-OVER (~576px) with collapsible sections:
  - **Basic info:** Name\* · Item type · Add image · SKU · Category(+add) · Class(+add)
  - **Sales** (toggle "I sell this…"): Sales description · Sales price · Income account(+add) · Sales tax
  - **Purchasing** (toggle "I purchase this…"): Purchase description · Purchase cost · Expense account\*(+add) · Preferred vendor(+add)
  - **Footer:** Make inactive · Cancel · Save
- **CATEGORIES** (`/app/categories`): list Name · Action(Edit) · "Create new category"; parent/child sub-categories. (26 live.)
- **FLAG:** Line Haul item income acct = "Sales of Service Income"; its Expense acct wrongly = "Sales of Product Income" (income acct in expense slot) — **CPA cleanup.**

### B2) CUSTOMERS (`/app/customers`)
- **List:** Name · Company name · Phone · Open balance · Action. Tabs Customers|Leads. Top: Customer types · "+ New customer"(menu) · Print · Export · gear · sortable. Row inline: Create invoice · Receive payment.
- **New Customer** = centered modal, sections: Name & contact (Title/First/Middle/Last/Suffix/Company/Display name\*/Email/Phone/Cc/Bcc/Mobile/Fax/Other/Website/Print-on-checks/Is-sub-customer) · Communication permissions · Addresses (billing+shipping "same as") · Notes & attachments (20MB) · Payments (Primary payment method/Terms/delivery/Language/Credit limit) · Additional info (Customer type/Sales tax/Exemption/Opening balance/As-of).
- **Customer DETAIL** (`/app/customerdetail?nameId=N`): left summary panel (name+initials, Email, Billing/Shipping, Notes, Phone, Custom Fields, Financial summary: Open balance+Overdue) + Edit/New transaction.
  - **Sub-tabs:** Transaction List · Activity Feed · Statements · Recurring Transactions · Projects · Customer Details · Late Fees. Secondary: Notes · Tasks · Opportunities · Conversations.
  - **Transaction List columns:** Date · Type · No. · Customer · Memo · Amount · Status · Action. Toolbar: Print · Export · Quick links · Table settings · More actions. Row: View/Edit · Print · More actions.
  - **Filters — Type:** All transactions · All plus deposits · Invoices · Estimates · Change orders · Credit memos · Sales Receipts · Unbilled Income · Money received · Recently paid.
  - **Status:** All · Open · Overdue · Paid · Pending · Accepted · Closed · Converted · Declined · Expired · Voided.
  - **Date:** standard ranges (Today/This-&-Last week/month/quarter/year/Custom).
  - **Sub-tab purposes:** Activity Feed=event log; Statements=generate/send (date-range "Last 12 months", Send email); Recurring=table Name/Type/Txn Type/Interval/Previous/Next/Amount/Action + New template; Projects=sub-jobs; Customer Details=editable profile; Late Fees=gated (enable in Account&Settings).

### B3) VENDORS (`/app/vendors`) — mirrors Customers with AP deltas
- **List:** Vendor · Company name · Phone · Email · 1099 Tracking · Open balance · Bill Pay ACH Info · Action. Top: Pay vendors(menu) · "+ New vendor"(menu) · Print · Export · gear. Row inline: Create bill · Pay balance · Email.
- **DETAIL** (`/app/vendordetail?nameId=N`): sub-tabs Transaction List · Vendor Details · Projects · Notes (leaner; no Statements/Recurring/Late Fees). Header: Edit · New transaction · Pay vendor.
  - **Transaction List columns:** Date · Type · No. · Payee · Category · Total · Bill Approval · Action.
  - **Type filter:** All transactions · Expense · Bill · Bill payment · Check · Purchase order · Recently paid · Vendor credit · Item Receipt · Expense (Receipt reminder). + Category filter. + Date.
  - Multiselect (header+row checkboxes) confirmed; pager "1–N of N"; toolbar open-filter-menu · Export to excel · Print · gear.
- **New transaction menu:** Bill · Expense · Check · Purchase Order · Vendor Credit · Pay down credit card.
- **Vendor Details tab:** Contact info (Vendor/Email/Cc/Bcc/Phone/Mobile/Fax/Other/Website/Attachments 20MB) + Additional info (Bill Pay ACH info/Billing address/Terms/Company/Notes), per-section Edit. Edit panel ≈582px.
- **REQUIREMENT:** Vendor detail must MATCH & perform same as Customer detail, AP equivalents swapped.

### B4) RECLASSIFY TRANSACTIONS (`/app/reclassify-transaction`) — NEW TMS page · **FINANCIAL/GATED**
- **Two-pane. LEFT:** Account types (Profit and loss / Balance sheet) · Basis (Accrual/Cash) · From:/To: · Type · Class · Location · "More filters" · "Find an account" search · account tree grouped w/ running AMOUNT.
  - **Type:** All · Bill · Check · Credit Card Credit · Credit Memo · Deposit · Expense · Invoice · Journal Entry · Refund · Sales Receipt · Vendor Credit.
  - **Class:** None · All · [class codes 10006,10012,10035,…].
  - **Location:** None · All · [**DRIVER/OPERATOR NAMES** — IH35 uses Location dimension = driver. Map Location→driver in TMS; CPA confirm.]
  - **[TODO]** "More filters" portal contents — enumerate live.
- **RIGHT (per selected account):** "Account: <name>" · Find-transactions text filter · Reclassify · live counter "N lines selected: $X". Columns: [✓] Date · Type · Account No. · Account · Memo/Description · Net Amount. Select-all+row checkboxes. Pager First/Prev/"1–N of N"/Next/Last.
- **RECLASSIFY modal:** "Make changes to all N selected lines" → Change account to(+add) · Change class to(+add) · Change location to(+add) · Cancel · Apply.
- **SAFETY:** respect period lock (no reclassify into closed period); write `audit.row_changes` per line (embezzlement evidence); reclassify = re-point existing postings' account/class/location, RLS-scoped, **NO new GL math**; greyed-out for non-reclassifiable types; **GATED owner/bookkeeper action.**

### B5) ACCOUNTING MODULE + CHART OF ACCOUNTS · **DUAL-DATASET FIX GATED**
- **Accounting sub-nav** (mirror scope, additive): Bank transactions · Integration transactions · Receipts · Reconcile · Rules · Chart of accounts · Recurring transactions · Revenue recognition · Fixed assets · Prepaid expenses · My accountant.
- **CoA** (`/app/chartofaccounts`) columns: Number · Name · Account type · Detail type · QuickBooks Balance · Bank Balance · Action. (199 rows live.)
  - **Toolbar:** "+ New account"(menu) · Batch actions · Batch edit · Export chart of accounts · Print · Run report(menu) · gear.
  - **Row Action menu:** View register (non-bank) / Reconcile (bank) · Edit · Make inactive (reduces usage) · Run report.
- **New/Edit Account DRAWER (576px ≈ 29%):** Account name\* · Account number · Account type\*(dropdown) · Detail type\*(dropdown, depends on type) · "Make this a subaccount"(toggle→parent) · Description · **Lock account** · Save/Cancel. This IS the inline "+Add new account" target AND the CA-04 edit drawer. KEEP Lock account.
- ***CRITICAL DUAL-DATASET FIX (root cause of "CoA showing wrong accounts"):*** The CoA PAGE currently renders the hardcoded "local-only" ~50-row seed (clean 1000 Cash/1100 AR/4100 Freight). The POSTING ENGINE reads the QBO-mirror (~199 real accounts via `/api/v1/mdata/accounts`). They mismatch. **FIX:** point the CoA page (and CA-05 register, role bindings) at the QBO-mirror dataset, RLS-scoped per company. **Task 0 = data-source audit** (which dataset feeds page vs posting engine), **GATED for Jorge before changing.** Do NOT disconnect QBO; the bug is internal (dual datasets), not the integration.

### B6) BANK TRANSACTIONS (`/app/banking`) · **FINANCIAL (match/categorize commit GATED)**
- **Tabs:** For review (N) · Categorized · Excluded. Columns: Date · Bank Detail · Amount · Payee · Added or Matched · Category · Rule · Action. Grouped by month. Row buttons by state: Add · Match · View · Split · Undo. "Added or Matched" shows "N matches found".
- **Pager:** "1-300 of 1568" + prev/next + numbered pages + page input.
- **EXPAND a For-review row** → 4 inline tabs: Categorize · Match · Record as transfer · Record as credit card payment.
  - **Categorize fields:** Transaction date · Select payee · Select category · Select product/service · Select customer/project · Billable · Select location · Select class · Memo. Footer: Create a rule · Exclude · Categorization history · Split · Add · Add attachment.
- **MATCH / "Find other matches" RESOLVE** (`/app/advancedmatch`):
  - Header: bank line (payee/date/Spent|Received $). "Find and select record(s) to match".
  - Controls: Search (description/check no./amount) · Date range · Record type · Filters · Customize.
  - Record type: All transactions · Money in · Money out · Suggested matches · Transfers · Rules · Missing payee/customer · Uncategorized.
  - Candidate table: [✓] Date · Ref No. · Transaction Amount · Payee · Open Balance · Payment. Row checkboxes (select one OR MANY, across different payees). Pager "1–N of N items · Page [input] of N".
  - ***STICKY BOTTOM SUMMARY BAR (Jorge's exact requirement):***
    `Bank transaction amount: $X  −  Selected amount: $Y  =  Difference: $Z` · "If needed, resolve the difference" · Total amount: $Y · Cancel · Match. Difference auto-computes (bank − Σ selected), live-updates per check; shows when off by $0.01+.
  - **RESOLVE-THE-DIFFERENCE** (click link) → inline line form to book the leftover: Select payee · Select category(account) · Select location · Select class · Memo · Enter amount → Selected + resolve line = Bank amount → Match enabled. Each dropdown +Add new.
- **Categorized tab:** accepted/matched; Action=Undo; shows linked record.

### B7) RECONCILE · **FINANCIAL (reconcile-commit GATED)**
- **SETUP** (`/app/reconcile?accountId=N`): Summary · History by account · Start reconciling · Bank register link. Fields: Account(dropdown) · Beginning balance(read-only) · Statement ending balance(entry) · Statement ending date(mm/dd/yyyy).
- **WORKING** (`/app/reconcileAccount?accountId=N`): header account · "Statement ending date" · Edit info · Save for later(menu) · Show me around.
  - **SUMMARY BAR (replicate math):** Statement ending balance − Cleared balance ; Beginning balance − N Payments + N Deposits = DIFFERENCE (must=$0.00 to Finish).
  - **Sub-tabs:** Payments · Deposits · All. Columns: [clear✓] Date · Cleared Date · Type · Ref No. · Account · Payee · Memo · Payment(USD) · Deposit(USD).
  - **Toolbar:** Filter · Print · gear · Save for later. GEAR+Filter: column toggles (Date/Cleared Date/Type/Ref no./Account/Payee/Memo/Banking status/Payment/Deposit) + DENSITY Regular/Compact/Ultra-compact + Cleared status/Transaction type/Date-From/Find. Pager+per-page.
  - Finish now enabled only at Difference=$0.00; Save for later preserves progress.
- **SAFETY:** live recompute Cleared+Difference; period-lock+audit; RLS.

### B8) TRANSACTION EDITOR (Expense, `/app/expense?txnId=N`) — FULL PAGE · **FINANCIAL**
- **Header:** "Expense #<no>" · Copy · "N online banking match"(link) · Payee(+add) · Payment account(shows running Balance) · Amount · Payment Date · Payment Method · Ref no. · Location.
- **IH35 TRUCKING CUSTOM FIELDS (KEEP):** Settlement No · Truck No · Pick Up Date · Delivery Date · SB-Load No · Empty Miles · Loaded Miles · Work Order.
- **Line sections (toggle):** Category details (# · Category(+add) · Description · Amount · Billable · Customer · Class) | Item details (# · Product/Service(+add) · SKU · Description · Qty · Rate · Amount · Billable · Customer · Class).
- **Footer:** Copy · Clear all lines · More (Delete · Void · Reverse · Transaction journal · Audit history) · Cancel · Save · Save and close.
- Editing a reconciled/matched txn → show **"R / reconciled — editing may affect a completed reconciliation"** warning.
- **OTHER EDITORS** (capture each live, same pattern): Bill · Check · Bill Payment · Vendor Credit · Purchase Order · Invoice · Sales Receipt · Receive Payment · Deposit · Journal Entry · Transfer.

### B9) BANK REGISTER (`/app/register?accountId=N`) = CA-05 ACCOUNT REGISTER target · **FINANCIAL read**
- **Columns:** Date · Ref No. · Payee · Memo · Class · Payment · Deposit · Tax · **BALANCE(running)** · Type · Account · Location.
- **Top:** "Add <txn>" inline new-row · Filter · gear(columns) · Print · Sort. Row click → inline edit in register; or Edit → full editor (B8). Pager "1-300 of 1581" + per-page + numbered/typed pages.
- **CA-05 MUST mirror THIS running-balance register** (not a plain list). Reuse posting read services; inline edit gated.

---

## PART C — BUILD SEQUENCE
0. **Task 0 (GATED):** dual-dataset data-source audit (B5) — report to Jorge, get OK before repointing CoA.
1. Build shared QBO-Parity UI System (A1 table grammar, A2 inline +Add, A3 sizing tokens). Static CI guard: a test asserting tables use the shared grammar component + density tokens.
2. Apply additively: Customers detail (sub-tabs+grammar), Vendors detail (AP grammar), CoA (+New/Edit drawer w/ Lock account), Bank transactions (tabs+expand+advancedmatch+resolve bar), Reconcile (setup+working+density), Bank Register (CA-05).
3. New page: Reclassify Transactions (B4), **GATED financial**.
4. Capture-and-spec remaining transaction editors (B8 list) + portal TODOs (inline +Add mini-form, More-filters, exact gear column toggles) — SAVE EACH to `docs/specs/qbo-parity/`.
5. Products & Services + Categories (B1) restructure to two-mode + slide-over.

## OUTSTANDING TODO CAPTURES (save each here as completed)
- inline "+ Add new" mini-form exact chrome
- "More filters" panel contents (Reclassify + Bank match)
- exact gear column-toggle lists per table
- remaining transaction editors: Bill, Check, Bill Payment, Vendor Credit, Purchase Order, Invoice, Sales Receipt, Receive Payment, Deposit, Journal Entry, Transfer
