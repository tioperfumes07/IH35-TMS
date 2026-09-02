# GO-18 — Load Costs and lineage map (2026-09-01)

**Status:** design law. **Incomplete in product:** Costs tab is **not** the 13th load-detail tab yet; Costs Board is **not** mounted; F+R expense/bill/JE/bank drills from a load are **not** live. This file is the map, not a second product.

**Complete software inventory (git download):** [`docs/lockdown/IH35-SOFTWARE-MAP/INDEX.html`](./IH35-SOFTWARE-MAP/INDEX.html) · interactive [`IH35-SOFTWARE-MAP-COMPLETE.html`](./IH35-SOFTWARE-MAP/map/IH35-SOFTWARE-MAP-COMPLETE.html) · findings [`MAP-FINDINGS.md`](./IH35-SOFTWARE-MAP/MAP-FINDINGS.md). Cascade rebuilt 584 screens / 150 modals / 2136 endpoints. **Do not treat missing tables as High crashes** — those were reclassified as guarded empty (`MAP-FINDINGS.md`).

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

| Surface | Job | In map / in product |
|---------|-----|---------------------|
| **Load detail → Costs** | 13th tab. Per-load: add/list costs, F+R to expense/bill/JE/bank, approx margin. | Mock: `IH35-SOFTWARE-MAP/designs/Load Costs Tab.html`. **Not mounted** on live load detail (still 12 tabs). |
| **Costs Board** (`/dispatch/costs` or dispatch sub-nav) | Home of incomplete / unlinked / unpaid load costs. Clicking a row opens **the same load detail Costs tab**. | Mock: `IH35-SOFTWARE-MAP/designs/Load Costs Board Home Page.html`. **No live `/dispatch/costs` leaf** until Codex FE hop. |
| Accounting Expenses / Bills lists | Canonical money chrome. Costs must deep-link here, never clone the wizard. | In the complete map under Accounting screens + `POST /api/v1/expenses` / bills. **Wired.** |
| Banking | Match/payoff of those same documents. | Map: banking endpoints. **97.5% unmatched = owner categorizes — do not invent GL.** |
| Settlements | Driver-facing remainder of the same costs. | Map: settlements screens. Load-cost remainder **incomplete** until Costs writes load FKs. |

Search the interactive map for `expenses`, `bills`, `bank_transactions`, then `loads` — that is the money chain Costs must reuse. Do not add a parallel costs ledger table.

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
| Software map “High” missing tables | **CLOSED.** Cascade re-read: guarded empty / unmounted / extractor noise. Do not rebuild as High. |
