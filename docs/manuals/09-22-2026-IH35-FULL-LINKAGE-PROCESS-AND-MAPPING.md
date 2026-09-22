# IH35-TMS — THE FULL PROCESS AND LINKAGE MAP
**Load → Invoice → Factoring → Cash → Driver Bill → Settlement → GL → Bank**
Issued 2026-09-22 · Lead · **BINDING ON EVERY SEAT**
Every column below was read from live production `information_schema` on Neon
`tiny-field-89581227` / `br-fancy-credit-akjnd07a`. Nothing here is invented.

> **THE LAW THIS ENFORCES:** *"Every record links both ways to its financial primitives and its
> operational modules — safety, insurance, legal, maintenance, dispatch, driver, unit, trailer,
> load. **A block with no linkage declaration is not done.**"*
>
> **FARO AND ALWAYSTRACK ARE THE SOURCE OF TRUTH. THE APP IS NOT.**
> **USMCA began operating 2026-08-07 on IH35 Transportation's QuickBooks and AlwaysTrack
> accounts — reconciliation spans USMCA-Faro AND Transportation-Faro.**

---

# PART 1 — THE CHAIN, END TO END

```
  CUSTOMER
     |
     v
 [1] LOAD  mdata.loads ................................. the canonical hub
     |        customer_id, customer_wo_number/customer_po_number  <- FARO'S KEY
     |        assigned_unit_id, load_trailer_equipment_id,
     |        assigned_primary_driver_id, tour_id, presettlement_link_id
     |
     +--> [2] COST SIDE, as it happens
     |        accounting.expenses      .load_id .unit_id .trailer_id .driver_uuid
     |                                 .vendor_uuid .source_fuel_transaction_id
     |                                 .journal_entry_id
     |        fuel.fuel_transactions   .load_id .unit_id .trailer_id .driver_id
     |                                 .fuel_card_id .vendor_id
     |        accounting.bills         .unit_id .trailer_id .driver_id .vendor_id
     |                                 .linked_work_order_uuid
     |
     +--> [3] REVENUE SIDE, at delivery + POD
              accounting.invoices      .source_load_id .customer_id
                                       .factoring_status  <- advanced | submitted | not_factored
                                       .factor_profile_id .factoring_advance_id
     |
     +--> [4] FACTORING, if factored
              accounting.factoring_advances .display_id .factoring_company_vendor_id .status
              accounting.factoring_reserve_movements
     |
     +--> [5] DRIVER PAY
              driver_finance.driver_bills    .load_id .load_number .driver_id
                                             .settled_in_settlement_id
              driver_finance.settlement_lines .load_id .settlement_id
                                              .source_driver_bill_id .posting_account_id
     |
     +--> [6] SETTLEMENT (round trip closes)
              driver_finance.driver_settlements .tour_id .driver_id
                                                .first_load_id .last_load_id
                                                .accounting_bill_id
                                                .accounting_bill_payment_id
                                                .paid_via_bank_txn_id
                                                .source_document_ref
     |
     +--> [7] GL — every one of the above
              accounting.journal_entries / journal_entry_postings
                .source_transaction_type .source_transaction_id
     |
     +--> [8] BANK — cash in and out
              banking.bank_transactions .matched_invoice_id .matched_bill_id
                                        .matched_advance_id .matched_settlement_id
                                        .matched_expense_id .matched_payment_id
                                        .matched_load_id .categorization_*
```

---

# PART 2 — THE THREE STATES. NOTHING IS "OPEN OR CLOSED".

| state | what it means | where it renders | number it carries |
|---|---|---|---|
| **OPEN DISPATCH** | moving, not delivered | Dispatch board | load number |
| **PRE-SETTLEMENT** | delivered + invoiced, **round trip not closed** | Load Costs / pre-settlement. **NOT the dispatch board.** | **our PRE-SETTLEMENT number — AlwaysTrack has no equivalent. This is our differentiator.** |
| **SETTLED** | round trip closed, numbers frozen | Reports only | settlement number |

**The canonical live predicate — one module, every consumer imports it:**
```sql
-- (1) status gate
l.status NOT IN ('draft','invoiced','paid','closed','cancelled')
-- (2) AND NOT demonstrably finished  <-- STATUS ALONE IS NOT ENOUGH ON THIS DATA
AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_lines s
                 WHERE s.load_id = l.id AND s.is_active IS TRUE)
AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_bills b
                 WHERE b.load_id = l.id AND b.status <> 'void')
AND NOT EXISTS (SELECT 1 FROM accounting.invoices i
                 WHERE i.source_load_id = l.id
                   AND i.status NOT IN ('draft','proforma','void'))
```
**Why (2) exists:** 24 of 33 loads were settled, driver-billed and expensed while
`mdata.loads.status` still read `dispatched`/`delivered`. **The money is the source of truth for
"is this load live", not the status.**

---

# PART 3 — MANDATORY LINKAGE AT CREATION. A RECORD WITHOUT THESE IS NOT CREATED, IT IS STARTED.

### [1] CREATE A LOAD — `mdata.loads`
| field | required | why |
|---|---|---|
| `customer_id` | **YES** | no customer, no invoice |
| `customer_wo_number` **or** `customer_po_number` | **YES** | **FARO KEYS ON THIS.** Without it the load can never be factored. 4 of 5 open loads have neither today. |
| `assigned_unit_id` | **YES at dispatch** | IFTA, maintenance, fuel, driver pay |
| `load_trailer_equipment_id` | **YES at dispatch** | 4 of 4 pre-settlement loads have none |
| `trailer_type` | **YES, and it must match the trailer** | says `dry_van` today on three reefers and a flatbed |
| `assigned_primary_driver_id` | **YES at dispatch** | driver pay |
| `tour_id` | **YES** | the round trip is the unit of settlement |
| stops with city/state/ZIP + scheduled times | **YES** | mileage, IFTA, detention, ETA |

### [2] COST — `accounting.expenses` / `fuel.fuel_transactions` / `accounting.bills`
| field | required |
|---|---|
| `load_id` | **YES** where the cost belongs to a load |
| `unit_id`, `trailer_id`, `driver_id`/`driver_uuid` | **YES** where known |
| `vendor_uuid` / `vendor_id` → **`mdata.vendors`** | **YES** (never `mdata.qbo_vendors`) |
| fuel: `fuel_card_id`, and **STATE** | **YES — IFTA is gallon-based per jurisdiction** |
| `journal_entry_id` | **YES once posted** |

### [3] INVOICE — `accounting.invoices`
| field | required |
|---|---|
| `source_load_id`, `customer_id` | **YES** |
| **`factoring_status`** | **YES — `advanced` \| `submitted` \| `not_factored`. THIS IS THE CANONICAL COLUMN. Do not re-derive it from `factoring_advance_id IS NULL`.** |
| `factor_profile_id` | **YES when factored** — NULL on all 80 invoices today |
| `factoring_advance_id` | **YES when advanced** |

### [4] FACTORING — `accounting.factoring_advances`
`factoring_company_vendor_id` → Faro, `display_id`, `status`, and **the invoice must point back**
via `factoring_advance_id`. **114 advances exist and only 63 invoices link to one — 51 orphans.**

### [5] DRIVER PAY — `driver_finance.driver_bills` / `settlement_lines`
`load_id` + `load_number` + `driver_id`; lines carry `source_driver_bill_id`, `settlement_id`,
`posting_account_id`. Two-line driver pay. Integer cents.

### [6] SETTLEMENT — `driver_finance.driver_settlements`
`tour_id`, `driver_id`, `first_load_id`/`last_load_id`, `accounting_bill_id`,
`accounting_bill_payment_id`, `paid_via_bank_txn_id`, `source_document_ref`.
**Settlement numbers follow ALWAYSTRACK's numbering, always.**

### [7] GL — every posting
`source_transaction_type` **and** `source_transaction_id` on **every line**. **A posting with a
NULL source is invisible to every document-keyed sweep** — that is exactly how 13533/13539 hid.
Every GL write goes through `journal-entries.service`. Double entry or it does not post.

### [8] BANK — `banking.bank_transactions`
Match to exactly one of `matched_invoice_id` / `matched_bill_id` / `matched_advance_id` /
`matched_settlement_id` / `matched_expense_id` / `matched_payment_id`, plus
`categorization_*` for load/unit/driver/vendor. **Matching is SUGGEST-ONLY, permanently.
A GET must never write.**

---

# PART 4 — THE RECONCILIATION MAP (external truth → our tables)

| source of truth | file / system | joins to us on | writes |
|---|---|---|---|
| **Faro purchases** | `01-FARO/PURCHASE REPORT ALL.csv`, `faro_canonical_purchases.csv` | **`PO` column → `loads.customer_wo_number`, then `customer_po_number`. NEVER the load number.** | `invoices.factoring_status='advanced'`, `factoring_advance_id`, `factoring_advances` |
| **Faro payments** | `01-FARO/PAYMENTS TO USMCA FROM FARO.csv` | `Inv` + `PO/Ref` | cash application, `banking.bank_transactions` |
| **Faro reserve** | `01-FARO/RESERVE REPORT.csv` | balance column pairs deposits to payables | `factoring_reserve_movements` |
| **AlwaysTrack** | `03-SETTLEMENTS/` — 116 PDFs, **122 loads, all with Trk / Trlr / Driver** | load number | unit, trailer, driver, miles, rate, revenue |
| **Dreamline fuel** | `04-FUEL/09-22-2026-FUEL-CARD-PROVIDER-STATEMENT-0807-0921-PARSED.csv` — **397 rows with a real `State` column** | card + date + unit | `fuel_transactions` **incl. jurisdiction** |
| **Love's network** | `04-FUEL/09-05-2026-LOVES-604-STORES-SEED.csv` — **604 stores each with `state`** | store number | fuel jurisdiction |
| **Relay** | Relay API + `integrations.relay_fuel_transactions` | **city + state are already in every description**: `Relay fuel · T176 · Love's · Mandeville, LA` | `fuel_transactions` **incl. jurisdiction** |
| **Self-carried** | `05-INVOICES-SELF-CARRIED/` — 009 FLS · 010 Supply Chain Mgmt · 026 IM Specialized · 055/13555 2EMS · 074/13593 Alligator | invoice number / load | `factoring_status='not_factored'` — **these five ONLY** |

**IFTA: gallons per jurisdiction, never dollars. DEF/urea is not a motor fuel.**
**No jurisdiction may be reported as "unresolvable" until all three fuel sources above are joined.**

---

# PART 5 — WHAT "FULLY LINKED" MEANS. THE DEFINITION OF DONE.

A block is done only when **every one** is true and **pasted as live proof**:

1. The record carries every mandatory link in Part 3 — **named, not implied**.
2. It links **both ways** — the parent points to the child and the child points back.
3. Its GL postings carry `source_transaction_type` **and** `source_transaction_id` on every line.
4. Its trial balance still nets **0.00**.
5. It reconciles to its external source of truth (Part 4) — **Faro/AlwaysTrack wins, always**.
6. It survives a **void**: `voidDocument()` reverses it in the same transaction, and the register
   shows it. **An already-collected (applied) deduction is NEVER reversed.**
7. A **named guard** exists on main, with a selftest proven **RED before GREEN**.
   *An assigned guard that was never written is not a guard.*
8. The **live row / live screen / live query is pasted.** No fake green.

**Every seat writes a `LINKAGE:` block in the PR body:**
```
LINKAGE:
  parent      -> <table>.<column>
  children    -> <table>.<column>, ...
  operational -> unit / trailer / driver / load / vendor / customer / WO / claim / matter
  financial   -> journal_entries (source_transaction_type + source_transaction_id)
  external    -> Faro <ref> | AlwaysTrack <doc> | Dreamline | Relay | none (say why)
  reverses_by -> voidDocument({type})
```
**A PR with no `LINKAGE:` block is not reviewed.**

---

# PART 6 — CANONICAL TABLES. WRITE LEFT. NEVER WRITE RIGHT.

| WRITE | NEVER WRITE |
|---|---|
| `driver_finance.*` | `payroll.*`, `settlement.*` |
| `mdata.qbo_*` | `accounting.qbo_*` |
| `banking.*` | `bank.*` |
| `maintenance.*` | `maint.*` |
| `mdata.vendors` | `mdata.qbo_vendors` |
| `catalogs.load_cancellation_reasons` | `catalogs.cancellation_reasons` |
| `mdata.loads` — canonical hub | |

**Hubs every record links back to:** `org.companies`, `identity.users`, `mdata.drivers`,
`mdata.units`, `mdata.loads`, `catalogs.accounts`, `mdata.customers`,
`maintenance.work_orders`, `mdata.vendors`, `accounting.journal_entries`, `docs.files`,
`mdata.equipment`.

**Never delete. Every void keeps a register. USMCA only. No sample rows in USMCA — ever.
QuickBooks write-back: never. `--no-verify`: forbidden, every seat, no exception.**
