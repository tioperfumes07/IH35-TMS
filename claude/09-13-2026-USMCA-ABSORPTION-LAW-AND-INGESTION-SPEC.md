# USMCA ABSORPTION LAW + ALWAYSTRACK INGESTION SPEC

**Author:** Claude Lead · **Date:** 2026-09-13 · **Status:** LAW. Supersedes every earlier statement of mine on the Aug-7 boundary, including PR #22011 and PR #22012.

This document is the specification. Coders build from it. It contains no work I performed on the data and no instruction to re-derive any of it.

---

## PART 1 — THE LAW

### L1. The settlement document is the atomic unit

An AlwaysTrack settlement document is indivisible. It is never split across entities, never partially loaded, never apportioned by leg.

### L2. The boundary

> **A settlement whose END date is on or after 2026-08-07 belongs to USMCA, in full.**
> **A settlement whose END date is on or before 2026-08-06 belongs to IH 35 Transportation, in full.**

Tested against all 44 documents (5753, 5760–5803): **0 exceptions.** Every document ending on or before 08-06 is absent from USMCA today. Every document ending 08-10 or later is present.

- **USMCA, in full — 34 documents:** 5769 through 5803.
- **Transportation, in full — 10 documents:** 5753, 5760, 5761, 5762, 5763, 5764, 5765, 5766, 5767, 5768.

### L3. Absorption — the owner's ruling, 2026-09-13

> **A settlement that carries both a Transportation load and a USMCA load is absorbed by USMCA in full — every load, every line-haul charge, every driver-pay line, every fuel receipt, every expense, every deduction, every reimbursement.**

There is no allocation, no split by load date, no pro-rata. A leg's own pickup date does not move it to another entity. The settlement's end date decides, once, for everything on it.

**Consequence:** the individual load date is *never* an entity test. Any code, seed, backfill or report that classifies a load by its own date rather than by its settlement's end date is wrong and must be corrected.

### L4. Transportation stays frozen

The 10 Transportation documents carry 69,698.00 invoiced, 13,873.82 driver pay, 29,072.80 fuel, 1,881.91 expenses. None of it enters USMCA. Nothing is read from, written to, or reported on for TRANSP or TRK.

### L5. Source of truth

`data/alwaystrack/settlements-truth-2026-09-13.json`, produced by `scripts/alwaystrack/parse_settlements.py`. The parse is self-validating: each document's own printed Totals reconcile to its parsed line items, 44/44, 0 mismatches.

Where this file and `IH35-SETTLEMENT-TIEOUT-2026-09-04.xlsx` disagree on a settlement's membership or a money figure, **the signed PDF wins** and the discrepancy is reported, not silently resolved. The tie-out predates this ruling and predates documents 5797–5803.

---

## PART 2 — THE TARGET STATE

After ingestion, for the 34 USMCA settlements:

| Dimension | Target | Live 2026-09-13 | Gap to close |
|---|---|---|---|
| Line haul / invoiced | 238,810.00 | 185,122.41 | −53,687.59 |
| Driver payment | 48,783.51 | 38,310.32 | −10,473.19 |
| Fuel | 110,072.33 | 67,443.72 | −42,628.61 |
| Company expenses | 8,487.81 | 2,806.72 | −5,681.09 |
| Driver net due | 49,297.42 | 49,199.17 | −98.25 |
| Fuel receipts | 171 rows | 166 rows | wrong on both sides |
| Expense lines | 178 rows | 42 rows | −136 rows |

These six numbers are the acceptance criteria. Exact, to the cent. No tolerance band.

### The seven loads absorption pulls in

These sit on USMCA settlements but are held today as `is_sample_data = true` placeholders. Under L3 they are real USMCA loads and must be converted:

| Load | On document | First stop | Line haul | Driver pay | Fuel | Fuel rows |
|---|---|---|---|---|---|---|
| 13497 | 5773 | 2026-07-03 | 7,200.00 | 939.87 | 2,184.88 | 3 |
| 13498 | 5769 | 2026-08-03 | 3,800.00 | 568.76 | 0.00 | 0 |
| 13503 | 5770 | 2026-08-04 | 4,900.00 | 947.15 | 1,770.91 | 3 |
| 13504 | 5771 | 2026-08-04 | 4,900.00 | 945.10 | 1,713.50 | 2 |
| 13506 | 5775 | 2026-08-04 | 3,900.00 | 581.58 | 1,100.82 | 2 |
| 13509 | 5770 | 2026-08-07 | 4,400.00 | 960.35 | 1,450.79 | 2 |
| 13579 | 5802 | 2026-09-04 | 4,900.00 | 945.10 | 1,491.70 | 2 |
| **Total** | | | **34,000.00** | **5,887.91** | **9,712.60** | **14** |

13579 is already `status = invoiced` while flagged `is_sample_data = true`. That combination is illegal under the entity law in either direction and is corrected here.

### Loads that stay out

The 12 remaining sample placeholders (13471, 13480, 13482, 13484, 13485, 13486, 13487, 13488, 13491, 13492, 13493, 13494, 13495, 13496, 13499, 13500) and the 3 absent loads (13481, 13489, 13501) appear only on Transportation documents. They stay exactly as they are. **Do not convert them. Do not create them.**

---

## PART 3 — INGESTION LOGIC

One idempotent importer. One transaction per settlement document. Converges on re-run. Never duplicates.

### 3.1 Natural keys — the whole design

Every object is identified by a key derived from the document, never by insertion order and never by a generated id. Re-running must match the same row and update it, not insert a second one.

```
load          = load_number
invoice line  = load_number + item + description
driver bill   = load_number + driver_id + pay_item        pay_item ∈ {Loaded Miles, Empty Miles, Deadhead Miles, N Picks, N Drops, N Stops}
fuel receipt  = purchase_date + vendor_invoice_number + gallons + amount
expense       = transaction_date + vendor + description + amount
deduction     = load_number + date + description + amount
reimbursement = load_number + date + description + amount
settlement    = source_document_ref  (the 4-digit AlwaysTrack number)
```

`vendor_invoice_number` is the receipt number printed in the FUEL PURCHASES Invoice column. Where a fuel row has no invoice number, the key degrades to date + gallons + amount and the row is written with `attribution_confidence = 'low'`. It is never guessed into a match.

### 3.2 Order of operations, per document

1. Resolve the entity by L2. If the end date is ≤ 2026-08-06, **skip the document entirely** and log it as Transportation. No partial work.
2. Upsert the settlement on `source_document_ref`. `period_start` / `period_end` from the document. `display_id` remains the internal counter and is never rendered.
3. Upsert every load named on the document, **including the seven in Part 2**, as a real USMCA load: `is_sample_data = false`, status derived from the document's stops, `operating_company_id` = USMCA. Stops from the document's stop list — type, city, state, zip, date, in printed order.
4. Upsert invoices from CUSTOMER CHARGES. One row per load per charge line. `source_load_id` set. Customer resolved by name against `mdata.customers`; where no exact match exists, create the customer and mark it for the merge queue rather than attaching to a near-match.
5. Upsert driver bills from DRIVER PAYMENT. One row per load per pay item, carrying `miles_basis`, `miles_basis_type`, `rate_per_mile_cents`, `rate_empty_per_mile_cents`, `loaded_pay_cents`, `deadhead_pay_cents` exactly as printed.
6. Upsert fuel from FUEL PURCHASES — see 3.4.
7. Upsert expenses from EXPENSES, carrying the printed **Reimb.** flag to `is_reimbursable` and the **Comp. Exp.** flag to `is_company_expense`. Both flags come from the document's own column positions; neither is inferred from the description.
8. Upsert deductions and reimbursements from the DRIVER settlement document.
9. Link (3.3). All of it, in this transaction.
10. Assert the document's own printed Totals against what was just written. Any variance rolls the whole document back.

### 3.3 Linkage — in the same transaction, never a follow-up

- `operating_company_id` = USMCA on every row, passing FORCED RLS.
- Every money row carries its `load_id`.
- `driver_finance.driver_bills.settled_in_settlement_id` **is set**. It is NULL on all 79 live driver bills today; that is the second link of the load-to-cash chain and it closes here.
- `expense_attribution.expense_load_links.expense_number` = the load number, written both ways.
- Every settlement carries its `tour_id`.
- Every settlement, invoice, bill, expense and fuel row is reachable from `mdata.loads` and reaches back to it.

**A block with no linkage declaration is not done.**

### 3.4 Fuel — stored as a real per-load cost

`fuel.fuel_transactions` holds 0 rows for USMCA. Every fuel purchase that loaded went into `accounting.expenses` under a `Diesel — …` memo, so IFTA, MPG, the fuel planner and fuel-card overage all read an empty table.

**Rule:** the receipt is the record. Each FUEL PURCHASES row becomes one `fuel.fuel_transactions` row carrying `purchased_at`, `load_id`, `driver_id`, `unit_id`, `vendor_id`, `gallons`, `price_per_gallon`, `total_cost`, `location_city`, `location_state`, `transaction_reference` (the receipt number). The expense posts **from** that row and carries `source_fuel_transaction_id`. One receipt → one fuel row → one posting. Never two.

Fuel already sitting in `accounting.expenses` with a `Diesel` memo is reconciled to the document by the fuel natural key: the matching expense is re-pointed to its new fuel transaction; an expense matching no document row is **voided**, never deleted, with `void_reason = 'ABSORPTION-D5 duplicate or unmatched fuel row'`.

DEF is **not** fuel. DEF lines print in the EXPENSES section, not FUEL PURCHASES. They are expenses and must not enter `fuel.fuel_transactions`, or MPG is wrong.

### 3.5 The net-zero settlements

5801, 5802, 5803 carry a non-zero gross and `net_pay = 0.00`. Document TOTAL DUE is 1,334.02, 2,104.84 and 1,624.05. Find the reason before writing a number — a net of zero with a gross present is a computation that did not run, not a value. Fix the computation; do not stamp the document's figure over a broken calculation.

### 3.6 Prohibitions

- No test, sample or demo rows in USMCA. Not for proof, not for a dry run. Rehearse on a Neon REHEARSE branch, then run on prod.
- Void, never delete. Nothing here deletes a money or audit row.
- No new GL math. Reuse the existing posting functions.
- Never edit an applied migration. New numbers strictly above `main`'s max, re-checked at push.
- Bank matching stays suggest-only, permanently. This importer never writes a `match_state` and never auto-confirms. The owner accepts or changes every match himself.
- No `is_sample_data = true` row may carry a live invoice, bill, posting or payment, in either direction.

### 3.7 Acceptance

`scripts/verify-alwaystrack-parity.mjs` prints one line per USMCA document across six dimensions and the four structural assertions, and exits non-zero unless **34/34 documents are exact on all six**. Merged is not done. CI-green is not done. The guard against prod is done.

**The bypass trap:** a CTE calling `set_config('app.bypass_rls','lucia',true)` must be declared `AS MATERIALIZED` and referenced in a **WHERE** clause, e.g. `(SELECT v FROM b)='lucia'`. Referenced only in the SELECT list, or not at all, it silently returns 0 rows under FORCED RLS and every comparison reads as a false match. A bare 0 is masked, not empty.
