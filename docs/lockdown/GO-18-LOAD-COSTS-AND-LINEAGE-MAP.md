# GO-18 — Load Costs and lineage map (2026-09-01)

**Status:** design law. Software map is **incomplete** until Costs writes the same posters as Accounting and both-way drills exist. This file is the map, not a second product.

USMCA only. NO-SEAT prod financial fixtures.

## Where Costs sits (one load, one set of books)

```
Dispatch (Book Load + load detail)
    │  GO-16 miles · GO-17 Save proof (created / linked / DID NOT)
    │  GO-18 Costs tab (13th) — operator records costs ON THIS LOAD
    ▼
Accounting chrome (same endpoints, same drawers)
    │  Expense  = paid now (bank/cash)
    │  Bill     = vendor invoice, due = bill_date + 30 days unless terms picker
    │  NEVER silent default between Expense and Bill — operator chooses
    ▼
GL poster (reuse existing postSourceTransaction — no new money math)
    │  balanced JE · flags OFF until owner says turn on
    ▼
Banking match
    │  expense/bill payment ↔ bank_transactions
    │  97.5% unmatched = OWNER categorizes. Do not invent GL rules.
    ▼
Settlements / driver bills / cash advances
    │  load-linked costs that hit the driver appear on settlement
    │  pre-settlement approx margin lives on the Costs tab (read of same rows)
    ▼
Cash Flow / reports
    same documents. No parallel “load costs ledger.”
```

## Not a second load page

| Surface | Job |
|---------|-----|
| **Load detail → Costs** | Per-load: add/list costs, F+R to expense/bill/JE/bank, approx margin. |
| **Costs Board** (`/dispatch/costs` or dispatch sub-nav) | Home of incomplete / unlinked / unpaid load costs. Clicking a row opens **the same load detail Costs tab**. |
| Accounting Expenses / Bills lists | Canonical money chrome. Costs must deep-link here, never clone the wizard. |
| Banking | Match/payoff of those same documents. |
| Settlements | Driver-facing remainder of the same costs. |

If a coder builds a standalone “Load Costs module” with its own tables, that is a defect.

## Cascade measured gaps (cite, then close)

| Finding | Measured |
|---------|----------|
| Bills missing driver / trailer | `accounting.bills` has `unit_id`; create schema in `bills.routes.ts` has `unit_id`, **no** `driver_id` / `trailer_id`. Expense path has driver + trailer + unit + load + vendor. |
| `bill_lines` missing `load_required` | `accounting.bill_lines` has `load_id`. `accounting.expense_lines` has `load_id` **and** `load_required`. G18 cannot fail-closed on the bill path the way it does on expense. |
| Expense already linked | `POST /api/v1/expenses` stamps load / vendor / driver / truck (`unit_id`) / trailer. Costs must call this, not a new writer. |
| Silent Expense vs Bill | Forbidden. Purpose picker required. Same as accounting chrome (`ParityDrawer` Record Expense / Vendor Bill). |

## Auto-link matrix (going forward, TMS-native only)

Do **not** invent load FKs on QBO-import / pre-dispatch rows (`load_required=false`, `PRE_TMS_DISPATCH_IMPORT`).

| From load | Stamp on cost | Reverse |
|-----------|---------------|---------|
| `mdata.loads.id` | `expenses.load_id` / `bill_lines.load_id` | load Costs tab lists them |
| assigned driver | `expenses.driver_id` (and bill header once column exists) | driver → expenses/bills |
| assigned truck | `expenses.unit_id` / `bills.unit_id` | unit financials |
| assigned trailer | `expenses.trailer_id` (bill trailer_id to add) | trailer financials |
| vendor picker | `vendor_uuid` / bill vendor | vendor AP |
| bank match | `bank_transactions.matched_*` | Banking register → document → load |

## GO-17 follow-on

Save proof panel (shipped #19428) shows Created / Linked people-and-units / ledger empty-honest / DID NOT.

**Later hop (same panel, not a twin):** “Costs created from this load” — count + links to expense/bill ids. Empty is honest until the operator records a cost.

## Pre-settlement approx margin

On the Costs tab: **linehaul (typed rate) − sum(linked expenses + bills + estimated driver pay)**. Label it **Approximate · before settlement**. Never claim CPA-final. Practical miles stay RPM only (GO-16).

## Open lanes (not owner questions)

| Item | Seat |
|------|------|
| Escrow $500.01 forensic | CC-1 (now) |
| Bill driver/trailer + `bill_lines.load_required` | CC-1 (after forensic) |
| Check ZIP Option 1 + city-alias apply | CC-3 |
| verify-static #19428 grep | CC-2 |
| Costs tab + Costs Board chrome | Codex (FE) after OPEN PRs |
| Unique 500/dead/silent | Cascade / Devin-A |
| Capitalize threshold / accessorial parent | **Jorge only** |
| 97.5% bank unmatched GL | **Jorge categorizes** |
