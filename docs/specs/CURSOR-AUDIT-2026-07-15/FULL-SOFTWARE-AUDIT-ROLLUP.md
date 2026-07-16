# IH35-TMS — Full software audit (plan only)

**Date:** 2026-07-15  
**Mode:** Audit only — **no build** in this pass.  
**Sources:** Live `app.ih35dispatch.com`, live QBO Banking, repo inventory, held migrations.  
**Canvas:** `ih35-full-software-audit-2026-07-15.canvas.tsx` (open beside chat).

---

## Core finding (your “old design stayed” problem)

Newer patterns exist in places (Banking categorize, `ReferenceSelect` +Add, `ParityTable`, Vendor/Customer rich modals, `RecordExpenseForm`). **Other create paths ignored the upgrade** and still ship older shells:

| Area | Newer | Old still live |
|------|--------|----------------|
| Expense | `RecordExpenseForm` + ReferenceSelect | Maintenance `CreateExpenseModal` (no +Add) |
| Bill | `VendorBillForm` + ReferenceSelect | Maintenance `CreateBillModal` (no +Add) |
| Bill payment | — | 3+ thin modals (PayBill / AP BillPayment / VendorDetail inline / banking CC) |
| Banking | `BankingTransactionsDesignView` | Workflow-B archived (good); Accounting creates did not adopt this chrome |
| Expenses route | List at `/accounting/expenses/list` | Default `/accounting/expenses` = **create form** (live confirmed) |

Owner lock: Expense/Bill/Bill payment = **QBO side panels** (§7.6). Today = full page or thin modal.

---

## Scorecard

| Area | Verdict |
|------|---------|
| Creator chrome drift | **HIGH** |
| Click-through / EntityLink | **PARTIAL** |
| Table grammar (sort / columns) | **MIXED** |
| Cross-module claim graph | **MISSING** |
| Bank Register from Banking | **WRONG TARGET** |
| Never-delete / only-add | **RULED** (project rules 06/07) |

---

## Banking vs QuickBooks (live)

| Capability | QBO | TMS | Status |
|------------|-----|-----|--------|
| Go to bank register | Pre-bound to selected account | Empty GL account picker | FAIL |
| Account cards | Bank $ vs Posted $ + badge | Plaid balance only (~5) | FAIL |
| Feed errors | 103/350 fix/disconnect | Thin; QBO sync often n/a | FAIL |
| Review tabs | Counts move on Post | For review 737 / Categorized 0 / Excluded 0 | FAIL |
| Grouping | Money in / Money out | By month (sort→page→bucket) | FAIL |
| Sort total list | Asc/desc on full set | Month bands confuse “total” sort | FAIL |
| Create rule / Exclude | On expand | Missing / weak | FAIL |
| Trucking dims | N/A | Driver/unit/trailer/load | PASS+ KEEP |
| Factoring / Escrow | N/A | Present | PASS+ NEVER DELETE |

---

## Click-through

- **`expense` EntityLink → null** (looks linked, goes nowhere; no `:id` detail).
- **No kinds** for claim, matter, accident_report, policy.
- **Dead query params:** `?claim_id=`, `?policy_id=`, `?expense_id=`, `?bill_id=` often ignored; `/bills/:id` wrong vs `/accounting/bills/:id`.
- Almost no EntityLink under: legal, inventory, compliance, fleet, liabilities, docs, tasks, cash-flow, home.

---

## Claim graph (your coordination bar)

End-to-end **claim → expense → repair shop → WO → driver receivable → settlement/escrow** = **NOT FOUND**.

Blocked by held migrations (among others): `202607250000`, `202607410000`, `202607240000`, `202607230000`, settlement/escrow linkage migrations. Claim API select does not expose forward FKs. No claim detail route.

---

## Table grammar

- **COMPLIANT:** Most major lists on ParityTable (Customers, Vendors, Bills, Invoices, Expenses list, WO, Legal matters, Claims, most Safety).
- **NON:** Banking (bespoke + month-after-page defect), Dispatch board (ColumnChooser unwired), PoliciesList/DataTable, many hand-rolled Accounting admin tables.
- No CI guard requires universal ParityTable adoption.

---

## Module tab law vs code

| Module | Design | Code | Drift |
|--------|--------|------|-------|
| Banking | 12 tabs | 5 | YES |
| Accounting | ~12–13 | 57 subnav; flyout 4 | YES |
| Legal | 6 | 6; flyout 4 | Mild |
| Insurance | Safety nested | Top-level 6 | YES |
| Safety | 28 | 28; flyout 5 | Mild |
| Maintenance | 10 | 10 + expanded flyout | Mild |
| Dispatch | 10–13 | ~22–25 | YES |
| Factoring | 3 under Banking | 7 FACT tabs | YES |

---

## Where production use will fail

1. Accident → shop repair → collect from driver — graph missing; maint expense ignores accounting form.  
2. Click Expense in list/match — no detail route.  
3. Banking → Bank Register — empty picker.  
4. Sort bank feed ascending expecting total list — month banding.  
5. +Add vendor on Maintenance bill — absent.  
6. Lawsuit → claim — dead query / no claim detail.  
7. Three bill-payment UIs — audit/court linkage risk.

---

## Already have (do not rebuild / do not delete)

Banking categorize + ReferenceSelect +Add; Vendor/Customer rich modals; RecordExpenseForm / VendorBillForm on accounting path; ParityTable on most lists; EntityLink for load/bill/invoice/vendor/customer/unit/driver/trailer/WO/JE/payment/bank_account/factoring_advance; Legal matter + WO + factoring advance details; Workflow-B archived; parallel books + OB 03/31 / 04/01 documented; Cursor rules 06/07.

---

## Build phases (only when owner says go)

- **A** Bank Register pre-bound + CoA clarity  
- **B** Bank feed QBO parity (Bank/Posted, errors, Money in/out, flat sort, Exclude/rules, tab counts)  
- **C** Universal table grammar on NON surfaces  
- **D** Expense/claim/accident EntityKinds + kill dead queries  
- **E** Claim graph (financial HOLD)  
- **F** Share accounting forms into Maintenance; side panels for txs  

---

## Part 2 — Fuel · Settlements · Inventory · Compliance · Factoring · Sidebar (continued same day)

### Fuel
| Class | Finding |
|-------|---------|
| HAVE | 8 locked tabs; CSV import; Loves prices; Relay deposit review; ParityTable history |
| DRIFT | Arch Module 5 ≠ locked tabs (no DEF/IFTA in-module); FUEL + Banking flyout dual door |
| MISSING | GL poster production callers; Relay→`fuel.fuel_transactions` bridge; EntityLink on History; Comdata API; fraud worker boot |
| WILL FAIL | Import OK but books empty; Relay-only IFTA blind; Fuel recon Save link no-op; dual IFTA preparers |

### Settlements / Driver finance / Escrow
| Class | Finding |
|-------|---------|
| HAVE | Canonical settlements; cash advance→liability; escrow multi-surface; recover-from-driver API |
| DRIFT | `payroll.*` RETIRE writer still active; many escrow UIs; Dispatch settlements stub |
| MISSING | Fine→liability does not seed deduction; claim→settlement recovery NOT FOUND; expense-form recover |
| WILL FAIL | Held `202607520000` posting linkage; bank recover flag OFF + consent; `driver_id` query dropped on redirect |

### Inventory
| Class | Finding |
|-------|---------|
| HAVE | Top-level + Maint parts; create/adjust/purchase; WO consume API |
| DRIFT | Design Maint-only vs live INVENTORY module |
| MISSING | Vendor on purchase; Inventory→WO/bill links; assignment trail |
| WILL FAIL | Assignments tab identical to Purchases; “Purchase History” is stock list |

### Compliance
| Class | Finding |
|-------|---------|
| HAVE | Dashboard; filings; fleet/driver drill-through; property-tax |
| DRIFT | Design Safety addendum vs top-level 7 tabs; 2290 SoR = Safety Permits |
| MISSING | URL-per-tab; Required Docs links |
| WILL FAIL | Deep-link Compliance tab; wrong SoR for 2290 |

### Factoring (FACT)
| Class | Finding |
|-------|---------|
| HAVE | 7-tab FACT; Accounting advances + EntityLink; Faro import; Dispatch queue |
| DRIFT | Multi-home FACT / Accounting / Banking / Dispatch; design 3 tabs vs 7 |
| MISSING | EntityLinks on Recourse/Chargebacks despite IDs |
| WILL FAIL | Cannot drill chargeback→advance; orphan `FactoringIndexPage` |

### Sidebar dual doors (never delete — add navigation honesty)
Factoring ×4 · Settlements ×3 · Fuel ×2 · Parts ×3 · Program ×2 · Safety flyout 5/28 · Accounting flyout 4/57 · ELD hidden stub.

### Highest-cost honesty gaps (Parts 1+2)
1. Expense/Bill chrome drift + Maintenance forks  
2. Claim→expense→WO→receivable graph missing  
3. Fuel GL poster zero callers + Relay silo  
4. Fine→liability without deduction + claim recovery absent  
5. Bank Register unbound + bank sort/group defect  
6. Dead EntityLinks / query params  
7. Dual settlement engines (`payroll.*` + `driver_finance.*`)  
8. FACT chargebacks without advance links  

### Audit coverage note
Parts 1–2 cover Banking, Accounting creators, EntityLink, tables, Legal/Insurance claim chain, Fuel, Settlements, Inventory, Compliance, Factoring, sidebar inventory. **Optional next:** Dispatch deep button sweep, Safety full tab live smoke, Docs/Lists catalog parity, HOME/SYSTEM owner surfaces.
