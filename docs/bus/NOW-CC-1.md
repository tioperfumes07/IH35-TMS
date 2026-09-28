# ROUND 163 JOB 1 DONE (AR reconciled to QBO to the cent) — CC-1 — 2026-09-28 11:50Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-20.md`.

## ROUND 163: Lead's claimed fixes — VERIFIED, not redone
Re-checked with the full read pattern (SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls;
verified neondb_owner/true — my first attempt silently ran as ih35_app, caught before trusting it):
- Unit constraint replaced: uq_loads_one_active_unit confirmed DROPPED, trg_refuse_overlapping_unit_assignment confirmed present.
- All 16 real loads (13624-13639): dispatched=16, with_unit=16, with_wo=16, missing_unit=0 — confirmed live, matches the Lead's numbers exactly.
- 7 stale loads: 13609/13617 -> invoiced, 13616/13618/13620/13621/13622 -> delivered — confirmed live.
- Samsara: is_enabled=true, confirmed still on (I found this earlier this session; it's held).
No redo needed on any of this.

## ROUND 163 JOB 1 (P0) — DONE, AUTH-099, AR reconciles to QBO exactly
Control file feed-input/qbo-invoice-list-2026-08-07-to-2026-09-27.csv (committed verbatim from the
owner's Desktop export). Full row-by-row reconciliation, both embedded tables parsed (main table +
a second block of 11 invoices hidden in CSV columns 19-26), every amount cross-checked against our
own DB — not a coarse total-minus-total subtraction. Math ties EXACTLY to QBO's own printed total:

  $143,920.00  already issued, matched by load number
+ $ 22,510.00  created live this round (5 loads, listed below)
+ $ 20,400.00  mismatched — customer/rate disagreement, reported not guessed (6 loads)
+ $278,061.72  unmatched — LOAD blank/text in QBO, reported not guessed (73 rows)
+ $  1,500.00  excluded — different billing entity (BBA Logistics/13530)
= $454,991.72  QBO's own printed control total, exact to the cent

CREATED (real, populated LOAD, customer+amount agree with QBO, not yet issued — minted through the
sanctioned engine, buildInvoiceFromLoad -> sendDraftInvoice mode="historical_backfill", never
hand-written; amount/date both derived from the load's own real data, never caller-supplied):
  13503 Semares Forwarding Services    $4,900.00
  13504 Semares Forwarding Services    $4,900.00
  13509 ES Logistics International LLC $4,400.00
  13533 Refrigerx Transportation LLC   $3,450.00
  13539 Refrigerx Transportation LLC   $4,860.00
All 5 live-verified: minted, sent, exact QBO amount.

MISMATCHED, reported, NOT touched (6 loads, all from the Aug 7-10 batch — a real, confirmed
customer/rate-attribution defect in our own data, pattern looks like a rotation across adjacent
rows, not one clean swap; needs each load's own real rate-con document, none located for loads
this old, before correcting customer_id or rate_total_cents):
  13505 QBO: Value Logistics LLC $3,900.00      | ours: Value Logistics Inc DBA A1 Value $3,900.00
  13506 QBO: Twin Cities Logistics $1,200.00    | ours: DH Express Inc $3,900.00
  13507 QBO: Value Logistics LLC $3,900.00      | ours: Twin Cities Logistics $1,200.00
  13508 QBO: Value Logistics LLC $3,800.00      | ours: NCC Logistics México $2,500.00
  13510 QBO: Refrigerx Transportation LLC $3,800.00 | ours: Impact Bulk Logistics $3,000.00
  13511 QBO: Refrigerx Transportation LLC $3,800.00 | ours: Rehmann Transportation Corp. $3,600.00

UNMATCHED, reported, NOT created (73 rows — LOAD column blank or a text placeholder like "NOT
PURCHASED" in QBO's own export; per the order's own instruction, never assumed from the Num suffix
— confirmed real trap: row "105- 13627" carries LOAD=13572, a DIFFERENT real load). Full list is in
the guard's own live output (scripts/verify-ar-ties-to-qbo-invoice-list.mjs) and the baseline file.

EXCLUDED: BBA Logistics LLC / load 13530 — "TRANSPORTATION" in QBO's own Location full name field,
a different billing entity, not USMCA's.

Guard scripts/verify-ar-ties-to-qbo-invoice-list.mjs: live PASS. Blocks immediately on any NEW
actionable gap (real load, agreeing customer+amount, not yet issued); the mismatched/unmatched
buckets are named-exception baselines (6/73) that only block if they grow.

## ROUND 163 JOB 2/3/4 — NOT STARTED THIS TURN
JOB 2 (Samsara backfill for the 16 current loads + prove a stamp lands): not started.
JOB 3 (mileage from Samsara position history): depends on JOB 2.
JOB 4 (fix the 6 copied-stop-data loads + the 1 tour_id-check-gap file, both already baselined by
me in ROUND 155.23): not started this turn.
Picking up JOB 2 next.
