# DOCUMENT INTEGRITY — accounting.expense_lines / accounting.expenses / accounting.invoices

CC-1, 2026-09-30, per Lead order "DOCUMENT INTEGRITY. This is the close gate the owner actually
means." USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). All numbers re-verified live before
acting; none carried over from the Lead's own measurement without independent confirmation.

## Re-verified starting counts (matched exactly)

```
expenses        1,640 total (voided_at IS NULL live check not directly asked; sub-counts below are)
  payment_account_uuid NULL (live, non-voided): 2
  vendor_uuid NULL (live, non-voided): 10
  load_id NULL (live, non-voided): 3
expense_lines   1,652 total
  expense_account_uuid NULL: 17
  item_id NULL: 639
invoices        155 total, 126 live
  customer_id NULL: 0
  source_load_id NULL: 2
```

## 1 — 17 expense_lines with no expense_account_uuid: RESOLVED, 0 remain

All 17 were already `voided_at IS NOT NULL, posting_status='unposted'` (dead, never-posted rows —
no GL/TB risk from completing their metadata). All 17 resolved via exact catalog item-name matches
against their own `description` text ("Fuel-DEF-Diesel Exhaust Fluid", "1ASC H1155LL HEADLIG" /
"2AS20WINDSHIELD" → Road Service-Truck Repair Expense per today's G2 precedent, "Road Service-Trailer
Tire Expense", "Driver Reimbursement-Fuel-Def", 3 "Uncategorized" rows whose own memo names a real
diesel fuel-card purchase with gallons/location/invoice ref → Fuel-Truck Diesel). No item created —
every mapping used an existing `catalogs.items` row. Live-verified: 0 remain.

## 2 — 12 rows (2 no payment_account_uuid, 10 no vendor_uuid): RESOLVED, 0 remain

- 2 no-payment-account rows (both unposted, both already carrying a real `driver_uuid`): set to the
  same 1000 Bank of America Operating account (`c7af1219-...`) every sibling row in the same
  "R145 SETTL" driver-reimbursement shape already uses.
- 10 no-vendor rows: per the Lead's own rule ("a vendor-less expense that turns out to be a driver
  reimbursement belongs to a driver, not to a blank") — 3 already had `driver_uuid` set correctly
  (vendor-less is CORRECT for those, nothing changed). 7 had NEITHER vendor NOR driver: backfilled
  `driver_uuid` from the expense's own `load_id → mdata.loads.assigned_primary_driver_id` (a real,
  independent source, same standing as this session's earlier fuel-linkage backfills) — every one
  resolved to a real driver. `vendor_uuid` stays NULL on all 10 (correct for a reimbursement).

## 3 — 5 rows (3 expenses no load_id, 2 invoices no source_load_id): RESOLVED / RULED, 0 open

- 2 invoices (display_id 90007, 010): both already carry a written ruling in their own
  `internal_notes` from earlier today/this session (ROUND 166 JOB 3 and AUTH-148 respectively) —
  genuinely load-less, real, non-freight/self-carried documents. Confirmed, not re-opened, no change.
- 3 expenses (EXP-2026-00544/545/546, all "R145 SETTL 5770" Fuel-DEF lines): settlement 5770's own
  driver (Neftali Coronado Urbano) has ANOTHER expense in the SAME settlement already linked to load
  13503 (a real USMCA load, id `2c2d9ae7-...` — independently confirmed it is NOT the frozen
  Transportation entity's load 13503, a different id under a different operating_company_id, before
  using it). Backfilled `load_id = 13503` on all 3 from this real, same-settlement sibling evidence.

## 4 — 639 expense_lines with no item_id: 519 RESOLVED, 120 NAMED AND LEFT — the honest remainder

Same class as G2. Every one of the touched rows was independently confirmed `posting_status IN
('reversed','unposted')` before writing — **zero were `posted`/live**, so this reclassification
moved no GL balance and required no adjusting JE (unlike G2, whose 16 resolved rows were on closed,
posted settlements).

**Method**: `description` text on this corpus routinely embeds the real category directly (e.g.
"Fuel-DEF-Diesel Exhaust Fluid", "Road Service-Trailer Tire Expense", "AT settl NNNN #N ... — <Item
Name>"). Matched against live `catalogs.items` (never invented — every item_id used already existed).
Where a bare `"ATGTx settl NNNN #N ..."` reference carried no category text, joined it to a sibling
`"AT settl NNNN #N ..."` row on the SAME (settlement, line#) pair, which does carry the resolved
category (confirmed same settlement+line = same underlying document line, category added by a later
correction pass) — 88 rows resolved this way. One additional real-evidence extension: a single row's
memo explicitly said `"1ASC 19 PREMIUM oil additive"`; the identical `"1ASC ''19 PREMIUM"` /
`"1ASC 19PREMIUM"` product code appears on 4 other rows at the identical $22.14 amount — same real
purchase code, mapped to `Driver Reimbursement-OTR-Maintenance, Oils, Additives`.

**519 of 639 resolved** (81.2%, $34,411.29 of the $39,378.60 originally-null total).

**120 of 639 left NULL, named, not guessed** ($4,901.31):
- **~106 bare `"ATGTx settl NNNN #N $X.XX load NNNN inv XXXXXXX"` rows** with NO category text
  anywhere and no `"AT settl"` sibling on the same (settlement, line#) key. Checked whether the
  embedded invoice numbers resolve against `fuel.fuel_transactions.transaction_reference` — they DO
  match real fuel purchases, but the referenced fuel transaction's own total (e.g. $580.03) never
  equals the line's amount (e.g. $9.97), and some reference numbers are shared by multiple, different
  fuel_transactions rows (including different `load_id`s) — not a safe 1:1 join. Checked
  `~/Downloads/_lead_parser/parsed.json` (the settlement-text corpus): its `"lines"` array only
  captures driver-pay/reimbursement/escrow/admin-fee/cash-advance SUMMARY categories, not individual
  fuel-stop line items — a specific $9.97/$15.25/etc. charge is not addressable by settlement+line#
  in that corpus either. No real source names these precisely. Full id list retained in the live
  query behind this doc (query: `expense_lines WHERE operating_company_id=... AND item_id IS NULL`).
- **7 `"Drv — settl NNNN load NNNN"` rows** — same shape, no category, no resolvable source.
- **6 `"AUTH-NNN ... $1.00"` synthetic proof-line artifacts** (AUTH-117/120/122/125/126, one
  `"CC-2 live-test check"` $25.00) — these are prior AUTH executions' own rehearsal-proof rows, not
  real vendor/driver costs. Flagged as a SEPARATE finding below, not force-categorized.
- **A handful of genuinely ambiguous rows**: `"AlwaysTrack settl 5805/5808 Honda $10.00 ... (driver-
  paid, Cr 2175)"` (merchant name "Honda" is not a fuel/parts category by itself), `"Company expense
  (settlement 5790) — inv CE-13554 — $20.80"` (no category anywhere in the text).

## SEPARATE FINDING, not fixed here — synthetic test rows may be live in USMCA

`accounting.expense_lines` carries at least one row literally described `"CC-2 live-test check"`
($25.00) and several `"AUTH-NNN ... proof line"` rows ($1.00 each). Standing law: "Never a
test/sample/demo row in USMCA." These were not checked for `is_sample_data=true` / voided status as
part of this task (out of scope — this task completes metadata, it does not audit row legitimacy)
but are flagged here explicitly since their presence, if `is_sample_data=false` and live, would be a
real violation worth a separate look.

## 5 — Engine fix, shipped in this PR

`db/migrations/202614690000_expense_lines_item_and_account_required.sql`: two `NOT VALID` CHECK
constraints on `accounting.expense_lines` — `expense_lines_item_id_required` (item_id IS NOT NULL)
and `expense_lines_expense_account_required` (expense_account_uuid IS NOT NULL). NOT VALID means
every FUTURE insert/update is enforced; the 120 grandfathered legacy rows above are not retroactively
failed. Confirmed live: a test insert with no item_id/account is correctly refused
(`expense_lines_expense_account_required` violation). Guard
`scripts/verify-expense-line-item-and-account-required.mjs` (verify-step 11817), shrink-only ratchet
at the 120/0 baseline, selftest 6/6, live PASS.
