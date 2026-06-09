# QBO-Parity Spec Index

Design law: **[QBO_PARITY_UI_SYSTEM.md](./QBO_PARITY_UI_SYSTEM.md)** (PART A shared UI system + PART B captured screens).

## The 9 captured screens
| # | Screen | Route | Financial? |
|---|---|---|---|
| B1 | Products & Services (+ Categories) | `/app/items`, `/app/categories` | no (catalog) |
| B2 | Customers (+ detail, sub-tabs) | `/app/customers`, `/app/customerdetail` | no (AR context) |
| B3 | Vendors (+ detail, AP deltas) | `/app/vendors`, `/app/vendordetail` | no (AP context) |
| B4 | Reclassify Transactions (NEW) | `/app/reclassify-transaction` | **GATED** |
| B5 | Chart of Accounts (+ New/Edit drawer) | `/app/chartofaccounts` | **GATED (dual-dataset fix)** |
| B6 | Bank transactions (+ advancedmatch + resolve bar) | `/app/banking`, `/app/advancedmatch` | **GATED (commit)** |
| B7 | Reconcile (setup + working) | `/app/reconcile`, `/app/reconcileAccount` | **GATED (commit)** |
| B8 | Transaction editor (Expense + 10 more) | `/app/expense` etc. | **GATED** |
| B9 | Bank Register = CA-05 | `/app/register` | **GATED read** |

## Shared system (PART A)
- **A1** Universal table grammar (filters · gear column-toggle + density · pager · multiselect batch · row 3-dots)
- **A2** Inline "+ Add new" in every reference dropdown (keep TMS lock-account control)
- **A3** Sizing tokens: ~30% right drawers for create/edit · full-page transaction editors · sticky bottom match/reconcile bars

## TODO captures still owed (each saved here when done)
- [ ] inline "+ Add new" mini-form exact chrome
- [ ] "More filters" panel contents (Reclassify + Bank match)
- [ ] exact gear column-toggle lists per table
- [ ] remaining transaction editors: Bill · Check · Bill Payment · Vendor Credit · Purchase Order · Invoice · Sales Receipt · Receive Payment · Deposit · Journal Entry · Transfer

## Gating reminder
Task 0 (dual-dataset CoA audit) and all B4–B9 commit actions are **owner/bookkeeper-gated** — see push policy in the design-law doc. Non-financial scaffolding (A1–A3, B1–B3 read/restructure) may self-merge when green+clean.
