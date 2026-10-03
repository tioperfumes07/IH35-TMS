# THE POSTING MAP — EVERY TRANSACTION, THE EXACT ACCOUNT, THE EXACT TRIGGER
Claude Lead, 2026-09-23 10:50 PM CT (2026-09-24 03:50Z).
Account numbers below are **read live** from `accounting.chart_of_accounts_roles` joined to
`catalogs.accounts` for USMCA `5c854333-6ea5-4faa-af31-67cb272fef80`. Not from memory, not from a doc.
Sources: `claude/00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md` §3 · `00-LAW-4-WHEN-A-DOCUMENT-POSTS.md` ·
`claude/GO-18-COSTS-BOARD-WIRING` (three dates) · owner ruling 2026-09-04 (driver advances, three paths).

**No seat resolves an account by name or by guessing. You resolve the ROLE. The role is the contract.**

## THE LIVE ROLE -> ACCOUNT MAP (USMCA, active bindings)
| role | acct | name | type |
|---|---|---|---|
| `revenue_default` | 4000 | Freight / Line-haul Income | Income |
| `unbilled_revenue` | 1150 | Unbilled Revenue | Asset |
| `ar_control` | 1100 | Accounts Receivable (A/R) | Asset |
| `ar_assigned_to_factor` | 1210 | A/R - Assigned to Faro | Asset |
| `factoring_advance_liability` | 2150 | Factoring Advance | **Liability** |
| `factor_reserve_default` / `factor_reserve_held` | 1230 | Factoring Reserves | Asset |
| `factor_fee_expense` | 6400 | Factoring Fees | Expense |
| `factor_wire_fee` / `bank_fee_recovery` | 6300 | Bank Service Charges & Wire Fees | Expense |
| `factoring_recoursed_ar` | 1220 | Factoring Recoursed Invoices | Asset |
| `default_interest_expense` | 6830 | Factoring Default Interest | Expense |
| `ap_control` | 2000 | Accounts Payable (A/P) | Liability |
| `operating_bank` / `cash_dip` | 1000 | Bank of America - Operating (USMCA) | Asset |
| `undeposited_funds` / `cash_clearing` | 1090 | Undeposited Funds | Asset |
| `company_fuel_advance_expense` | 5000 | Fuel & Diesel | COGS |
| `toll_scale_expense` | 5300 | Tolls & Scales | COGS |
| `reimbursement_expense` | 5310 | Lumper Expense | COGS |
| `driver_pay_expense` | 6890 | Cost of Labor-Mexico Drivers | COGS |
| `driver_payroll_clearing` | 2170 | Driver Net-Pay Clearing | **Liability** |
| `escrow_liability_default` | 2100 | Driver Escrow - Held in Trust | **Liability** |
| `advance_recovery` | 1245 | Driver Cash Advances Receivable | Asset |
| `fuel_overage_receivable` | 1250 | Driver Fuel-Overage Receivable | Asset |
| `insurance_expense` | 5600 | Truck Insurance | Expense |
| `prepaid_asset_default` | 1410 | Prepaid Expenses | Asset |
| `maintenance_parts_expense` | 6160 | Parts & Supplies Expense | COGS |
| `heavy_repair_expense` | 6150 | Heavy Repair Expense | OtherExpense |
| `fixed_asset_default` | 1500 | Trucks & Tractors | Asset |
| `accum_depr_default` | 1600 | Accumulated Depreciation | Asset |
| `depr_expense_default` | 6860 | Depreciation Expense | OtherExpense |
| `lease_recovery` / `rent_expense` | 5800 | Leased Trucks from IH35 TRUCKING | COGS |
| `civil_fines_expense` | 6170 | Fines & Penalties | OtherExpense |
| `other_operating_expense` | 6999 | Other Operating Expense | Expense |
| `uncategorized_expense` | 9000 | Ask My Accountant | Expense |
| `retained_earnings` | 3900 | Retained Earnings | Equity |

---

## 1. REVENUE — THE TWO-EVENT LATCH
| trigger | posting |
|---|---|
| Load **delivered** | `DR 1150 Unbilled Revenue` / `CR 4000 Line-haul Income` |
| **POD received**, invoice converts | `DR 1100 A/R` / `CR 1150 Unbilled Revenue` |
`1150` must return to **0.00** for a load whose POD event has posted. Live today: $0.00 across 60 lines — correct.
Accessorials post to **4200** and its children (4210 detention · 4220 layover · 4230 lumper · 4240 TONU).

## 2. FACTORING — SECURED BORROWING, ASC 860. A/R IS NEVER DERECOGNIZED.
| trigger | posting |
|---|---|
| Invoice purchased by Faro | `DR 1210 A/R - Assigned to Faro` / `CR 1100 A/R` |
| Advance funded (the wire) | `DR 1000 Operating Bank` (the leg that actually arrived) · `DR 1230 Factoring Reserves` (escrow + cash reserve withheld) · `DR 6400 Factoring Fees` (discount) · `DR 6300 Bank & Wire Fees` (wire + schedule) / `CR 2150 Factoring Advance` **at GROSS** |
| Customer pays the factor | `DR 2150 Factoring Advance` / `CR 1210 A/R - Assigned to Faro` |
| Reserve released | `DR 1000 Operating Bank` / `CR 1230 Factoring Reserves` |
| Invoice recoursed back | `DR 1220 Factoring Recoursed Invoices` / `CR 1210` and the advance settles against `2150` |
**The wire lands in 1000, not 1090.** A purchase day funds in ONE OR TWO wires (noon and ~3 PM) — one leg each,
never merged, never invented. `1090 Undeposited Funds` is a pass-through, never a resting place.

## 3. EXPENSE vs BILL — LAW 4, THREE DATES
| what | DATE ONE (incurred) | DATE THREE (cleared) |
|---|---|---|
| **Expense** (paid on a card / bank now) | `DR <category account>` / `CR the CARD or bank actually used` | nothing further — matching only clears |
| **Bill** (owed) | `DR <category account>` / `CR 2000 A/P` | **Bill payment:** `DR 2000 A/P` / `CR 1000 Bank` |
DATE TWO (due) drives cash flow and A/P aging **and posts nothing**.
A record with **no payment account AND no vendor** is an orphan -> `PostingEngineError`. Never silently default.

**Category accounts by cost type:** diesel -> **5000** · tolls & scales -> **5300** · lumper -> **5310** ·
parts -> **6160** · heavy repair -> **6150** · repair **>= $7,000 capitalizes** -> **1500** (then depreciates
via 6860 / 1600) · truck insurance -> **5600**, and **future-period insurance belongs in 1410 Prepaid**,
amortized monthly, never expensed on day one · fines -> **6170** · truck lease from IH35 TRUCKING -> **5800** ·
nothing else fits -> **6999**, and only a genuinely undecided line -> **9000 Ask My Accountant**.

## 4. FUEL — ONE POSTING PATH, NEVER TWO
`fuel.fuel_transactions` is the OPERATIONAL record and **NEVER posts.**
`accounting.expenses` is the ACCOUNTING record: **`DR 5000 Fuel & Diesel` / `CR the real card`**, at DATE ONE,
inheriting **every** link from its load — `load_id`, `driver_uuid`, `unit_id`, `trailer_id`, `vendor_uuid`,
plus `source_fuel_transaction_id`. Then MATCHED in Banking, which **clears and does not post**.
Live today: 5000 is **$0.00** against **$42,891.08** of fuel expenses. That difference closing to zero is the proof.

## 5. DRIVER PAY, THE DRIVER BILL, AND THE SETTLEMENT
| trigger | posting |
|---|---|
| Load booked -> **driver bill created automatically**, numbered = the load number | `DR 6890 Cost of Labor-Mexico Drivers` / `CR 2000 A/P` (the driver is a vendor) |
| Settlement closes (see §6) | deductions and escrow move; net pay lands in `2170 Driver Net-Pay Clearing` |
| Escrow withheld | `CR 2100 Driver Escrow - Held in Trust` — **a LIABILITY**, cap 2,500, 5% net-pay floor |
| Net pay disbursed | `DR 2170 Driver Net-Pay Clearing` / `CR 1000 Bank` |
Driver pay is **two lines always** — loaded and empty — on **short miles**.

## 6. THE SETTLEMENT — OWNER RULING 2026-09-23
> "the settlement should be automatically closed when load is closed."

The round trip is the unit: **NB opens · TR extends · SB closes it at Laredo.**
Open = **pre-settlement** (live revenue and costs, what Cash Flow and Dispatch render).
Closed = **settlement** (frozen, posts to GL).
**Closing the tour-closing load closes the settlement, automatically, through the existing engine**
(`closeSettlementPayRun`, `settlement-posting/*`). Assignment was always automatic; the close is now automatic
too. *Note for the record: `00-IH35-CURRENT-STATE-AND-LAW-READ-FIRST.md` §2 previously read "closing is
confirmed by a human, never automatic." The owner's 2026-09-23 ruling supersedes it. Owner decides.*
**NO NEW GL MATH.** Maker != checker. Void, never delete.

## 7. DRIVER ADVANCES — THREE PATHS, NEVER COLLAPSED (owner ruling 2026-09-04)
| path | what it is | posting |
|---|---|---|
| **1. Broker -> us**, diesel for the driver, deducted from the invoice | `accounting.broker_advances` category `diesel`; applies to `invoices.broker_advance_applied_cents`; reduces what the factor purchases, **never the invoice face**, **never `driver_finance.*`** | BUILT AND CORRECT — do not rewrite |
| **2. Broker -> the driver directly**, applied by us as a **BILL PAYMENT** against his driver bill | receipt side reduces what the factor purchases exactly as (1); disbursement side settles part of `driver_finance.driver_bills`; both linked to the SAME `broker_advances` row by `instrument_reference` — one instrument, two sides, one trace | **NOT BUILT — this is the gap** |
| **3. Us -> the driver**, a fuel advance | **a COMPANY EXPENSE**, rung 1 direct trace | `DR 5000 Fuel & Diesel` / `CR 1000 Bank`, and that is the whole entry |
**Path 3 creates NO receivable.** He is a B1 company driver, not an owner-operator: no `outstanding_balance`,
no `recovered_in_settlement_id`, no amortization. For USMCA `economic_routing` resolves to `load_expense`;
`driver_settlement` must be unreachable for a company driver, enforced at the SERVICE boundary, never only in React.

## 8. BANKING — THE TWO ENTRY POINTS (LAW 4)
| path | posting |
|---|---|
| **MATCH** (document already exists and already posted) | **NOTHING.** Links and clears. Permitted writes: match/clear state, who and when, and a genuine variance leg alone. |
| **CATEGORIZE** (bank line with no document) | `DR the chosen account` / `CR 1000 Bank`, at the bank date. One bank line, ONE journal entry, N split lines each with its own account and linkage. Cannot save unbalanced. |
| **RESOLVE DIFFERENCE** | the variance leg only, to a **reason code**, never a raw account picker: bank_fee · wire_or_processing_fee · factoring_fee · early_pay_discount_taken · fx_difference · rounding · customer_short_pay_writeoff. Under $50 silent · $50-$500 soft warning · over $500 a real second confirm. |
Suggest-only, permanent. Never auto-match. Every write records who and when. A GET never writes.
`banking.bank_transactions` is never created, deleted or modified — 1,133 for USMCA, exact.

## 9. ATTRIBUTION — USE THE HIGHEST RUNG THE COST CAN REACH
1 **Direct trace** — fuel, tolls, scales, repairs, lumper, permits. One truck, one place, one date.
2 **Trace to the leg** — driver pay and revenue; the leg carries the truck.
3 **Allocate on MILES** — only costs that genuinely belong to the whole trip. Very few.
**Fixed monthly costs — insurance, plates, the truck note — are period costs on the UNIT and never land on a trip.**
The test: point a CPA at a document, not at a formula you chose.

## 10. THREE BINDING DEFECTS FOUND WHILE READING THE LIVE MAP
1. **`advance_recovery` is bound to `1245 Driver Cash Advances Receivable` (Asset).** The 2026-09-04 ruling says
   a company driver advance creates **no receivable**. Either the binding is wrong or the ruling needs an
   exception in writing. **CC-1 reports which; does not silently rebind.**
2. **`driver_payroll_clearing` has three rows** — two inactive pointing at `1245` (an Asset receivable), one
   active and correct at `2170` (Liability). The two inactive rows are wrong-account history. Report, do not delete.
3. **Duplicate role rows** on `escrow_liability_default`, `damage_recovery` (3) and `reimbursement_expense`.
   Cosmetic today because only one is active — but a role resolving to two rows is one bad query from a wrong post.

---
**THE ONE THING THAT MUST NEVER HAPPEN:** the same money on the load twice — once when the document was
entered and again when it was paid or matched. Cost is recognised **exactly once**, at DATE ONE. A payment
clears a liability. A match clears a bank line. Neither is a cost.
