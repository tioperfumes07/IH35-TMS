# QBO-Parity UI System — v2 + v3 (deep-dive, functions, linkage, logic)

Captured from the build chat (live QBO inspection, IH 35 Transportation LLC, 2026-06-08). Companion to v1 (`QBO_PARITY_UI_SYSTEM.md`). **Software-wide standard** — applies to the ENTIRE TMS, not just accounting.

> Push policy: docs self-merge when clean. Anything touching `accounting.*`/`catalogs.accounts` schema/posting/balances/periods/reconcile-commit/reclassify-apply = financial cluster = policy (i) — gated. ADDITIVE-ONLY. Vocab "+ Create"/"+ Book". RLS: SET `app.operating_company_id` before every accounting/catalogs read. KEEP trucking custom fields + lock-account.

## v2 — SOFTWARE-WIDE STANDARD
This UI system is the DEFAULT for the entire TMS: every list, catalog, profile, edit page, create panel, and every "add a new X" flow — Accounting, Lists/Catalogs, Dispatch, Maintenance, Fuel, Drivers, Vendors, Customers. No module invents its own sizing or add-flow.

- **A1 Universal table grammar** (one shared component, every table): filter row (Type/Status/Date + context Category/Class/Location) · right toolbar (Print/Export/GEAR/More) · GEAR popover (column show/hide + density Regular/Compact/Ultra + Save-as-default) · multiselect → batch bar · pager (arrows + numbered + type-a-page + Go-to-date + "N–M of TOTAL" + per-page) · row 3-dots. Dense, content-width columns.
- **A2 Sizing tokens** (software-wide): create/edit = right drawer ~576px (~29%); item/sell+buy panel ~752px; big forms (New Customer) centered modal ~700–800px; transaction editors (Expense/Bill/Invoice/work-order) = FULL-PAGE dense grids; match/reconcile = sticky bottom bar. **Density tokens must satisfy 44px mobile touch targets (responsive: dense desktop, 44px mobile).**
- **A3 Inline "+ Add new"** (every reference dropdown, software-wide): "+ Add new" is FIRST option; existing options show "Name + Type" (e.g. "BOA-CHECKING-1135 Bank"); click → NESTED create panel ON TOP of the current (parent stays open) → Save creates + RETURNS with value selected. Accounts/categories also keep lock-account control. ONE shared `ReferenceSelect` with inline-create; cascading Account type→Detail type lives here. Applies to accounts, categories, classes, locations(=drivers), items, services, vendors, customers, terms, payment methods, parts, vehicles, drivers.

## v3 — FUNCTIONS + LINKAGE + LOGIC (Blocks A–H)

### BLOCK A — Bank Transactions page (bank-feed inbox)
**Why:** recommend-then-confirm loop — bank sends transactions, system GUESSES payee+category (rules + vendor defaults), human accepts/fixes before anything posts. Nothing posts silently.
Tabs: For review (count) | Categorized | Excluded. Columns: Date · Check No. · Bank Detail (verbatim) · Payee · Categorize-or-Match · Class · Spent · Received · Action. Per-account tabs across top; "Statements aren't importing" broken-feed state. Expand row → 4 inner tabs: **Categorize** (Transaction date · Payee · Category · Product/Service · Customer/Project · Billable · Location · Class · Memo; Split/Create-a-rule/Exclude/History/Add), **Find match/Match** ("N matches found" = bank line + manual entry are the SAME event seen twice; match links them so no double-count), **Record as transfer**, **Record as credit card payment**. Filters: types/custom dates/search/month-group. Multiselect → batch. POSTING on accept = financial-gated.

### BLOCK B — Bank Register (CA-05), per-account ledger
**Why:** single account's full history with RUNNING BALANCE; every row carries reconcile status; a transfer appears in BOTH accounts (counter-account shown each side); clicking any row drills to the editable source.
Columns: Date · Ref No. · Payee · Memo · Class · Payment · Deposit · Tax · BALANCE(running) · Type · Account · Location. Banner "Reconciled through <date>" (live 12/31/2024). Status blank→C(Cleared)→R(Reconciled). Tools: Add transaction(inline) · Filter · Go To Date · Jump to page · gear · Print. Inline "Add transaction" TYPE menu: Check·Deposit·Sales Receipt·Receive Payment·Bill Payment·Refund·Expense·Transfer·Journal Entry. Row click → inline in-row edit (Ref/Payee/Memo/Class/Currency/Payment/Deposit/Tax/Account/Location) + Edit→full editor + View. Transfer = TWO mirrored lines, Account col = counter-account. Markers: "-Split-", "To Print", "Credit Card Pmt", settlement# in Bill Payment memo. Inline-edit writes = gated.

### BLOCK C — Chart of Accounts + Edit/New Account panel
**Why:** the spine — TYPE + DETAIL TYPE decide where a dollar lands on P&L/Balance Sheet; type MUST drive detail (cascade prevents mistyping); live balance-sheet preview shows placement before save; Lock account protects reconciled/closed accounts.
Columns: Number · Name · Account Type · Detail Type · QuickBooks Balance · Bank Balance · Action. Filters: name/number search; Type filter (All·Created by you·Balance sheet·P&L·Locked only·Unlocked only·Parent only·Subaccounts only); select-all+checkboxes→batch. Row menu: Edit·Make inactive·Run report | View register. Toolbar: +New account·Batch actions·Batch edit·Run report·Print·gear.
**Edit/New panel (576px, TWO-COLUMN):** LEFT = Account name*·Account number·Account type*·Detail type*(CASCADES)·Make subaccount(→parent)·Description·[bank: Connected-to/Disconnect-on-save]·Balance·Lock account. RIGHT = "Edit account preview" live balance-sheet position (updates as type changes). Type groups: ASSET[Bank·A/R·Other Current Assets·Fixed Assets·Other Assets]·LIABILITY[Credit Card·A/P·Other Current Liabilities·Long Term Liabilities]·EQUITY·INCOME[Income·Other Income]·EXPENSE[COGS·Expenses·Other Expense]. Detail for Bank: Cash on hand·Checking·Money Market·Rents Held in Trust·Savings·Trust account (each type → own detail set; replicate cascade). All account dropdowns carry "+Add new". TODO: capture Edit panel live (portal resisted automation). **Dual-dataset CoA repoint stays GATED (Task 0 audit first).**

### BLOCK D — Vendor/Customer pre-categorization → bank-feed suggestion
**Why:** recurring vendors always hit the same account; setting a default once per vendor (bulk via existing multi-select) turns categorization into accept-the-suggestion. Seed that makes TMS banking behave like QBO For-Review.
Build: vendor/customer master gets a default account/category, settable in BULK via existing select-box multi-select on Vendors/Customers lists → rules table (payee=vendor→default category) → bank For-Review suggests the default when payee matches → user accepts/overrides → Add/Match. Reading defaults/suggesting = non-financial; **posting on accept = gated.**

### BLOCK E — Transaction Linkage Map (connective tissue)
**Why:** one money story per load; every screen is a view of it; keeping links end-to-end means nothing lost or double-counted.
LOAD --load#--> INVOICE line "LOAD NUMBER - N - <charge>" --posts--> Income + debit A/R (each charge type = own income account). INVOICE → RECEIVE PAYMENT (apply via open-invoices, select-all) → deposits to Bank → Register(Receive Payment) → "N online banking match" → Bank Feed. DRIVER(=Vendor) <--settlement#-- BILL(driver-pay items, load-linked per line) --posts--> COGS + credit A/P → BILL PAYMENT(select bills) → pays from Bank → Register(Bill Payment, settlement# in memo) → match. EXPENSE(unit#+load/ref in memo) → expense acct → Register → match (fuel/maint ALWAYS carry UNIT#; enables per-truck/per-load cost; driver-fronted → reimbursement Bill to driver A/P). TRANSFER → two register lines (counter-account). Every txn: register row → inline edit → full editor → footer Copy·Clear·More[Delete·Void·Reverse·Transaction journal·Audit history]·Cancel·Save·Save&close. Status in 3 linked places: "N online banking match" = C/R column = Added/Matched.

### BLOCK F — Settlement engine + driver-loan/advance auto-deduct
**Why:** the Products&Services items ARE the menu of pay/deduction/reimbursement line types a settlement is built from; the driver-loan automation solves the real bleed — money paid FOR a driver gets forgotten; tying every advance to a per-driver balance that auto-deducts at settlement makes forgetting impossible.
Item catalog = settlement line types: DRIVER PAY (CDL-Loaded/Empty Miles, Mexico-B1 miles → CL-Nomina-Driver Pay; Bonus/Extra Pick/Repairs/Layover/Local/Oversize/Tarp → CL-Driver Extra Pay). DRIVER DEDUCTIONS (Express Code Fee/Fine-Late/Fines/I-94/Wire&ACH → COL-Line Haul Driver Payment; Accident&Damages/Meals/Personal → CL-Nomina-Driver Deductions; Escrow for Claims → 2026-Damage Claim Escrow). DRIVER REIMBURSEMENTS (Warehouse-Lumper → Warehouse-Lumper Fee Expense; Fuel Def → Fuel-Def). DRIVER ADVANCE: "Petty Cash Advance-Caja Chica" → "Driver Cash Advance" (Other Current Asset) — advance→driver-loan link ALREADY EXISTS. Settlement screen = these items per driver per period (W02..W06). AUTO-DEDUCT: assign advance to a driver → driver advance balance (Driver Cash Advance asset) → running balance on driver record → at settlement auto-PROPOSE a contra deduction line CREDITING the asset → balance drops, closed loop. Deductions today scatter across 4 accounts — must post to ONE consistent per-driver advance account. **5 OPEN QUESTIONS (Jorge confirms before posting logic):** Q1 one balance or buckets? Q2 full vs partial per period? Q3 PWA-visible? Q4 1099 only or W-2? Q5 per-expense "recover from driver" flag? **Posting logic = financial-gated; UI free to build.**

### BLOCK G — Sizing/grammar/inline-add standard (applies to all of A–F + every module)
Same as v2 A1/A2/A3. One UI vocabulary across the whole app; dense desktop + 44px mobile; inline "+Add new" removes context-switch friction everywhere.

### BLOCK H — Build sequence + repo commit
Order (each its own additive UI-only PR, diff + PR# to Jorge, self-merge on green; financial HELD per-block):
1. Shared system: A1 grammar (✅ #824), A2 sizing + 576px drawer (🔄 A3 #825), A3 ReferenceSelect inline-create (+cascade+lock).
2. Sidebar additive: Driver Hub + Cash Flow (V0; not full reorder).
3. Apply UI: Bank Transactions(A), Bank Register(B), CoA page+Edit panel(C), Customers/Vendors detail+lists.
4. Vendor/Customer pre-categorization → suggestion(D): suggestion non-financial, posting gated.
5. Non-accounting modules: catalog grammar + profile pattern + drawer sizing + inline-add (Dispatch/Maintenance/Fuel/Drivers/Vehicles).
6. GATED (per-block OK): Reclassify, CoA dual-dataset repoint (Task 0 first), Bank match/advancedmatch+resolve, Reconcile, transaction editors, opening balances, settlement posting + driver-loan auto-deduct.

## PART C — apply across non-accounting modules
Lists/Catalogs, Dispatch, Maintenance, Fuel, Drivers: every catalog/list uses A1 grammar; every profile uses left-summary + sub-tabs + dense related-records table (Vehicle Profile, Driver Profile mirror Customer/Vendor detail); every edit/create uses the ~576px (or ~752px sell+buy) drawer; every "add new X" uses the A3 inline ReferenceSelect. Mapping mirrors QBO; records carry category/account/type, editable in-app. ADDITIVE — keep trucking custom fields.

## Outstanding live-capture TODOs
- CoA Edit panel exact chrome (portal); inline "+Add" mini-form; "More filters" contents.
- Remaining transaction editors: Bill · Check · Bill Payment · Vendor Credit · Purchase Order · Invoice · Sales Receipt · Receive Payment · Deposit · Journal Entry · Transfer.
- Forensic audit record (`docs/audit/IH35-TRANSPORTATION-FORENSIC-AUDIT-2026-06-08.md`): 10 findings + 199-account chart + transaction-chain evidence (observation-only, CPA-coordinated; owner-reported — needs independent verification before treated as fact).
