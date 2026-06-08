# Chart of Accounts + Register — QuickBooks Online Parity Spec & Gap Analysis
Captured live from IH 35 Transportation LLC (QBO) vs app.ih35dispatch.com — 2026-06-07.
Scope: replicate QBO list/drawer/register format, filters, gear, batch, export, print — and apply the
same gear/list behavior to **every list in the app**. Accounting is a do-not-touch module → PREVIEW FIRST.

================================================================================
PART A — QBO "NEW ACCOUNT" DRAWER  (this is the size/shape to match)
================================================================================
- Right-side DRAWER, **576px wide** (~30% of a 1922px viewport). Compact — NOT a full-width modal.
- Title: "New account".
- Fields IN ORDER:
    1. Account name*            (required)
    2. Account number
    3. Account type*            (required, dropdown — see catalog below)
    4. Detail type*             (required, dropdown — DEPENDENT on Account type)
    5. Make this a subaccount   (checkbox → reveals parent-account picker)
    6. Description
    7. Lock account             (toggle)
    8. Save / Cancel
    9. "Video tutorials" link (footer)
- Required = Account name, Account type, Detail type.

ACCOUNT TYPE CATALOG — 15 types in 5 groups:
  ASSET:     Bank · Accounts receivable (A/R) · Other Current Assets · Fixed Assets · Other Assets
  LIABILITY: Credit Card · Accounts payable (A/P) · Other Current Liabilities · Long Term Liabilities
  EQUITY:    Equity
  INCOME:    Income · Other Income
  EXPENSE:   Cost of Goods Sold · Expenses · Other Expense

DETAIL TYPE — repopulates per Account type. Example captured live:
  Account type = Bank →  Cash on hand · Checking · Money Market · Rents Held in Trust · Savings · Trust account
  (Each of the 15 account types has its own detail-type list — full list to be sourced from QBO when building.)

================================================================================
PART B — QBO CHART OF ACCOUNTS LIST
================================================================================
COLUMNS:  NUMBER · NAME · ACCOUNT TYPE · DETAIL TYPE · QUICKBOOKS BALANCE · BANK BALANCE · ACTION
- Per-row tag: **BAL** (balance-sheet account) or **P&L**.
- ACTION per row: "View register" (balance-sheet accounts) / "Run report" (P&L accounts).
- 198 accounts in this company.

TOOLBAR:  New account · Run report · Batch actions · Batch edit · All lists · Filter/search · Export · Print · pagination

MULTI-SELECT (batch):  "Select all accounts" checkbox + per-row "Select <account>" checkboxes → Batch actions / Batch edit.

GEAR (Settings popover) — THE PATTERN TO REPLICATE ON EVERY LIST:
  Columns (toggle):   Number · Type · Detail type · Description · QuickBooks balance · Bank balance
  Other:              Include inactive · Show account type badges
  Page Size:          50 · 75 · 100 · 200 · 300
  Table Density:      Cozy · Compact

================================================================================
PART C — QBO ACCOUNT REGISTER  (View register)
================================================================================
COLUMNS:  DATE · REF NO. · PAYEE · MEMO · CLASS · PAYMENT · DEPOSIT · Tax · BALANCE · TYPE · ACCOUNT · LOCATION

TOOLBAR:  Settings (gear) · Filter · Clear filter / View All · Batch edit · Print list · Export to Excel · Reconcile · account switcher · Actions menu

FILTER PANEL:  Date (All dates / Custom) · Transaction Type · Reconcile status · Payee · Memo  → Apply / Reset

GEAR (Settings):  Page Size (…300) · Table Density (Compact) · Column toggles (Memo, Class, Location, etc.)
  → same gear pattern as the list.

================================================================================
PART D — OUR APP TODAY  (app.ih35dispatch.com/lists/accounting/chart-of-accounts)
================================================================================
LIST COLUMNS (ours):  ACCOUNT NUMBER · DISPLAY NAME · DETAILS · STATUS
TOOLBAR (ours):       + Create · FAQ   (nothing else)
- 200 rows dumped, NO pagination, NO page-size control.
- NO gear / NO column toggles / NO include-inactive / NO density.
- NO multi-select checkboxes / NO Batch actions / NO Batch edit.
- NO Export · NO Print.
- NO per-row "View register" / "Run report".
- NO ACCOUNT TYPE column, NO DETAIL TYPE column, NO QuickBooks/Bank balance columns, NO BAL/P&L tag.
- Has a search box.

OUR "+ CREATE" FORM:  title "NEW CHART OF ACCOUNTS"
  Fields: Account Number · Display Name · Account Type · Description · Active
  - Full-width modal (~99% viewport) — the oversized panel to replace with a 576px right drawer.
  - MISSING: Detail type (+ dependent catalog) · Make this a subaccount (+ parent picker) · Lock account.
  - "Active" present (vs QBO "Lock account").

================================================================================
PART E — GAP LIST (what to add — ADDITIVE ONLY)
================================================================================
NEW ACCOUNT DRAWER:
  [ ] Convert oversized modal → 576px right-side drawer.
  [ ] Add Detail type field, dependent on Account type.
  [ ] Account type catalog = 15 types / 5 groups (above).
  [ ] Detail type catalog per account type.
  [ ] "Make this a subaccount" checkbox → parent-account picker.
  [ ] "Lock account" toggle (keep existing Active as-is; additive).
  [ ] Field order to match QBO.

COA LIST:
  [ ] Add columns: ACCOUNT TYPE, DETAIL TYPE, QUICKBOOKS BALANCE, BANK BALANCE; BAL/P&L row tag.
  [ ] Per-row action: View register (BS) / Run report (P&L).
  [ ] Gear: column toggles + Include inactive + Show account type badges + Page Size (50/75/100/200/300) + Density (Cozy/Compact).
  [ ] Multi-select checkboxes (select all + per row) → Batch actions + Batch edit.
  [ ] Export + Print buttons.
  [ ] Pagination driven by page size.

REGISTER (new screen to build to QBO format):
  [ ] Columns: DATE/REF NO./PAYEE/MEMO/CLASS/PAYMENT/DEPOSIT/Tax/BALANCE/TYPE/ACCOUNT/LOCATION.
  [ ] Toolbar: Settings · Filter · Clear filter/View All · Batch edit · Print list · Export to Excel · Reconcile · account switcher.
  [ ] Filter panel: Date(All/Custom) · Transaction Type · Reconcile status · Payee · Memo · Apply/Reset.
  [ ] Same gear (page size/density/columns).

GLOBAL (Jorge's standing requirement):
  [ ] The SAME gear control on EVERY list in the app: Page Size 50/75/100/200/300 · Include inactive / Active only / All ·
      Table Density Cozy/Compact · column toggles. Plus Export + Print where lists appear.

NOTE: Accounting is 1 of the 12 do-not-touch modules + "No Design Changes Without Preview" → build a PREVIEW first
(see companion CURSOR-PREVIEW-COA-QBO.txt) and get Jorge's approval before touching the live module.

================================================================================
PART F — CONFIRMED ADDITIONS (Jorge, 2026-06-07)
================================================================================
Universal list behaviors — apply to EVERY list in the software (built once in the shared ListView):
  - Every column adjustable WIDTH (drag the edge) and DRAG-TO-REORDER.
  - Click a column header to SORT, toggling descending <-> ascending (text, number, date) with a caret.
  - Multi-select FILTERS wherever a filter has discrete options (e.g. Transaction type, Reconcile status,
    COA View = All / Balance sheet / P&L).
  - Shared GEAR everywhere: column show/hide, page size 50/75/100/200/300, Include inactive / Active / All,
    density Cozy/Compact.
  - Sticky header; sticky running-balance column on registers.
  - Totals/footer row (sum of visible or selected numeric columns).
  - Export (CSV + Excel) and Print honor the current filter, sort, and visible columns;
    "select all across pages" vs "this page only".
  - Server-side pagination + row virtualization (COA dumps 200 rows today; customers/vendors are thousands).
  - Per-row SYNC badge: synced / local-only / QBO-only (attacks the known QBO drift).
  - Saved views (OPT-IN): persist column widths/order, visible columns, page size, density, filters
    per user (server-side). Unrelated to the locked VQ7 accrual/cash "no per-user memory" rule.

Chart of Accounts additions (confirmed):
  - Beginning balance + as-of date on the New/Edit drawer, ADJUSTABLE later via Edit; posts/adjusts
    through the EXISTING accounting service (Opening Balance Equity offset). Never new financial code.
  - Make any account INACTIVE (archive, never delete); Merge accounts. Both via existing services.
  - Subaccount hierarchy with indent + collapse/expand.

Trustworthy-as-QuickBooks additions:
  - Audit history surface (who created/edited/made-inactive/merged/adjusted, with before/after + actor +
    timestamp) reusing the existing audit schema.
  - Reconcile entry point on the register (full reconcile vs Plaid feeds = follow-on).

Faithfulness note: do NOT add fields QBO's drawer lacks beyond the explicitly authorized beginning
balance + active/make-inactive. The captured QBO drawer has no "opening balance" line by default — we add
it deliberately, by Jorge's instruction, and make it adjustable.
