# ROUND 191 item 2 — per-load document table, loads 13624-13639, live 2026-09-28

DIRECT INSERT was authorized, but checked every real operational source first (rate con, load,
mdata.load_stops flags, `driver_finance.cash_advance_requests`, `accounting.bills`,
`fuel.fuel_transactions`) before writing anything. **Nothing new was written this pass** — every
column below except Driver Bill is honestly zero because no real source document exists yet for
these loads, not because nothing was checked.

| Load | Driver Bill | Fuel Expense | Toll | DEF | Cash Advance | Bill Payment |
|---|---:|---|---|---|---|---|
| 13624 | $926.02 (open) | none | none | none | none | none |
| 13627 | $615.41 (open) | none | none | none | none | none |
| 13628 | $812.58 (open) | none | none | none | none | none |
| 13629 | $779.14 (open) | none | none | none | none | none |
| 13630 | $0.00 (open, no rate card) | none | none | none | none | none |
| 13631 | $644.64 (open) | none | none | none | none | none |
| 13632 | $652.13 (open) | none | none | none | none | none |
| 13633 | $718.90 (open) | none | none | none | none | none |
| 13634 | $656.64 (open) | none | none | none | none | none |
| 13635 | $881.38 (open) | none | none | none | none | none |
| 13636 | $926.02 (open) | none | none | none | none | none |
| 13637 | $980.26 (open) | none | none | none | none | none |
| 13638 | $922.42 (open) | none | none | none | none | none |
| 13639 | $896.98 (open) | none | none | none | none | none |

## Why every non-driver-bill column is honestly empty
- **Fuel:** confirmed via ROUND 190's own fuel-feed root cause — `fuel.fuel_transactions` is fed
  only from settlement documents (via `seedFuel()`) or Settlement Creator's `fuel_purchases`
  array; none of these 14 loads has closed a settlement yet.
- **Toll/DEF:** `mdata.load_stops.lumper_required` is `false` on every stop of every one of these
  14 loads (0 total), and no rate-confirmation PDF for any of these load numbers exists locally
  (checked `~/Downloads` by load number, zero hits). A toll or DEF cost only becomes a real
  document once a driver reports it (settlement expense line) or a rate con names it — neither
  has happened yet for loads still in the dispatched/active pipeline.
- **Cash advance:** `driver_finance.cash_advance_requests` has zero rows for any of these 14
  loads' assigned drivers created after the load itself — no advance has been requested against
  any of them.
- **Bill payment:** requires a vendor bill first (`accounting.bills`); zero bills reference any of
  these 14 loads via `accounting.bill_lines.load_id`.

## Honest conclusion
These 14 loads are genuinely too early in their lifecycle (still dispatched/in-transit,
pre-delivery, pre-settlement) for toll/DEF/fuel/cash-advance/bill-payment documents to exist. This
is not an import gap — there is nothing to import. Creating placeholder rows here would be exactly
the fabrication the round's own standing law forbids. The Load Costs board will correctly show
these columns as empty for these 14 loads until real costs are actually incurred and reported
(driver settlement, rate con addendum, or a vendor bill) — driver pay is the one real cost that
exists pre-delivery, and it is already populated (AUTH-114/115).

**Accrual tie check:** none of these 14 loads' driver bills are linked to the 51 CLOSED settlement
documents the tie (gross $80,608.41 / net $75,629.80) covers — all 14 are `status='open'`,
unsettled. Nothing in this pass touches a closed document, so the tie is untouched by construction
(zero writes were made this pass at all).

## Item 4 — Load Costs Chrome verification, live 2026-09-28

Navigated to `https://app.ih35dispatch.com/accounting/load-costs`, entity USMCA Freight Solutions
Inc, "In Motion" filter (default). Page renders correctly: **14 loads**, matching the DB exactly
-- Revenue Booked $61,375.00, Driver Pay Accruing $10,412.52 (sums to the exact per-row Loaded
Pay + Deadhead Pay from AUTH-114/115), 1,868.7-1,929.2 mi per load matching `miles_shortest`
exactly, deadhead miles/pay showing correctly on 13629 (114mi/$54.72) and 13637 (113mi/$54.24).
**Costs Recorded: $0.00 / 0 entries** -- the live UI visually confirms the same honest zero this
doc's own table reports; Fuel/Lumper/R&M Exp/Other columns render as "—" (empty) for every one of
the 14 rows, not a fabricated or default value. The board is rendering real numbers correctly;
there is nothing broken to fix here -- the empty cost columns are the honest state of these loads'
real document set (see item 2 above).

— CC-2
