# QBO Live-Capture Findings — 2026-06-28

**Status:** Design / Docs only — non-posting capture notes. Updates the relevant PART B screen specs in
`QBO_PARITY_UI_SYSTEM.md` with details verified against the **live QBO UI** (IH 35 Transportation LLC).
**Method:** headed-Chrome capture harness (`~/CascadeProjects/qbo-capture/`, local-only). The operator
signed into QBO; the harness only navigated + screenshotted. **Screenshots are NOT committed** — they
contain real balances, vendor/customer names, and account data.
**Author:** Cascade (design lane). Companion to the A2 + B4 capture docs (which carry the +Add and
Reclassify detail).

---

## 1. Chart of Accounts (B5)
- **Sub-nav (live, in order):** Bank transactions · Integration transactions · Receipts · Reconcile ·
  Rules · Chart of accounts · Recurring transactions · Revenue recognition · Fixed assets · Prepaid
  expenses · My accountant · Intuit Experts.
- **List columns:** Number · Name · Account type · Detail type · QuickBooks Balance · Bank Balance ·
  Action.
- **Toolbar:** Batch actions · Filter by name or number · [type filter: All] · Batch edit · export ·
  print · gear · **New account** (green +dropdown) · Run report. Pager "1–201".
- **Row action menu:** bank rows show **View register** (primary) + dropdown (**Edit · Create
  subaccount · Make inactive (reduces usage) · Run report**).
- **New account drawer (right, ~30%):** Account name\* · Account number · Account type\* · Detail type\*
  (dependent) · **Make this a subaccount** · Description · **Use for billable expenses** · **Lock
  account** (kept) · live **New account preview** tree · **Cancel · Save (+dropdown)**.
- **Account type options (live):** Asset → Bank · Accounts receivable (A/R) · Other Current Assets ·
  Fixed Assets · Other Assets; Liability → Credit Card · Accounts payable (A/P) · Other Current
  Liabilities · Long Term Liabilities; then Equity · Income · Cost of Goods Sold · Expenses · Other
  Income · Other Expense.

## 2. Bank transactions (B6) — DELTAS vs the prior spec
- **Tabs are now `Pending (N) · Posted · Excluded`** (the prior spec said "For review/Categorized").
- Row primary action is **`Post`** (+dropdown), not "Add/Match".
- **Columns:** Date · Full Bank Description · Spent · Received · (attachment) · (note) · From/To ·
  Customer · Product/Service · Action. Grouped by **Money in (N) / Money out (N)**.
- Account selector card + carousel of accounts (Bank / Posted balances); **Update · Requests · Link
  account** controls. Toolbar: Search · date filter · transaction-type filter · Collapse all groupings ·
  pager ("1–50 of 54 · Page 1 of 2") · print · export · gear. "Switch to previous version" + "Go to
  bank register" links present.

## 3. Bank register (B9 / CA-05)
- Reached via CoA row **View register**. **Running-balance register** confirmed (not a plain list).
- Columns: Date · Ref No. · Payee · (type sub-row) · Account · Payment · Deposit · running balance area ·
  reconcile-status note. Inline **Add check/▾** new-row at the bottom: Date · Ref · Payee(+▾) · Class(▾) ·
  Payment · Deposit · Account(▾) · Location(▾) · Add Attachment · **Cancel · Save**. Pager "1-100 of 2790,
  Page 1 of 28". Confirms CA-05 must mirror this running-balance register with inline edit.

## 4. Vendors (B3) + Customers (B2)
- **New Vendor form:** Name and contact (Company name · **Vendor display name\*** · Title · First ·
  Middle · Last · Suffix · Email · Phone · Cc · Bcc · Mobile · Fax · Other · Website · Name to print on
  checks) · Address (collapsible) · Save. Banner: "Skip the form — Ask for business and payment info".
- **New Customer form:** same form factor with AR fields (Customer display name\*, contact, billing /
  shipping). Vendor list left-nav under Expenses & Bills (Vendors · Bills · Bill payments · Mileage ·
  Expense claims · Contractors · 1099s).

## 5. Products & Services (B1)
- **New product/service** type picker: **Service · Inventory item · Non-inventory item · Bundle · Batch
  import · Import from sales channel**.
- List columns: Name · Sales description · Category · SKU · Type · (Edit). Filters: Search by name/SKU/
  category · Type (All) · Stock status (Any) · Filters. Left-nav under Sales & Get Paid.

## 6. Reclassify (B4) + account-types
- See `B4-RECLASSIFY-MORE-FILTERS-CAPTURE-2026-06-28.md`. Key: **Filters** funnel → **Filter By** panel
  (From · To · Type · Class · Location · Customer/Vendor · Modify · Clear all · Apply). Account types
  selector = **Profit and loss · Balance sheet**.

## 7. "+ Add new" universal affordance (A2)
- Confirmed live: the **"+ Add new"** row sits at the **TOP** of reference dropdowns (accent + `+`), and
  opens a **right slide-over drawer** for rich entities; footer `Cancel · Save and new · Save and close`
  (account drawer: `Cancel · Save`). Detail in `A2-INLINE-ADD-NEW-CAPTURE-2026-06-28.md`.

---

## 8. OPERATIONAL FLAG (not a UI item — for Jorge) ⚠️
The live Bank transactions page shows **bank-feed connectivity failures** on IH 35 Transportation LLC:
- "Unable to get transactions for **10 accounts**" — e.g. IBC-5231 (Error 103 — username/password not
  working), and PNC-2786 / PNC-2954 / PNC-2962 (Error 350 — account disconnected), "6 more errors".
- "Update required for 1 account" — CL-CC-Discover Card-4451 statements not importing.

This is a **live QBO data-feed issue**, independent of the TMS build. Surfaced here because it affects
any QBO-mirrored data the TMS reads. **Recommend Jorge re-authorize/fix those bank feeds in QBO.** No
action taken by Cascade.

## 9. Follow-ups (non-blocking, for a later capture pass)
- The **Modify** dropdown options (Reclassify Filter By).
- Transaction editors not yet opened in detail: Bill · Check · Bill payment · Vendor credit · PO ·
  Invoice · Sales receipt · Receive payment · Deposit · Journal entry · Transfer.
- Reconcile **working** screen (only setup landing reached).
- Bank-match (advancedmatch) "More filters".
