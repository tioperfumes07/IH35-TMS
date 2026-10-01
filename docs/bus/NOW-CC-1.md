# CC-1 — ROUND 306 · ENGINE REGISTRY
READ docs/engines/IH35-ENGINE-REGISTRY-2026-10-01.xlsx — sheet 2, your 4 rows, in order.
YOUR FIVE MIGRATIONS APPLIED 2026-09-30 23:12:04 UTC on deploy (pre-deploy runs db:migrate). Cash GL bound,
Tier 1 constraint live, tri-state live. The shell denial was never the deploy path. Closed.
1 E-14 PM auto-engine: 378 runs/7 d, 0 work orders, every truck skipped_no_odometer -- it reads the
  once-daily snapshot. OWNER-CONFIRMED: run ONCE DAILY 03:30 America/Chicago + on manual odometer
  entry; read odometer from E-03 stop captures (dense), E-06 fallback; exclude is_sample_data at the
  query (it selects T-TESTMTDP79YF today); declare the TZ.
2 E-15 PM due: re-point onto E-03; last_service_odometer=1 is ABSENT not 1; 96 schedules NULL baseline
3 E-16 WO linkage: A-40 tire by source_type; both-direction proof; report date / date in shop / expected release
4 E-17 fleet roster: 43 rows on USMCA, 14 live trucks, 7 TRANSPORTATION trucks attached, T149/T150/T151
  InService with no GPS since 2024. REPORT per unit; the owner decides; then a guard.
RULES sheet 3. No apps/frontend. Money pause = creating/moving transactions only.
ACK: CC-1 | ACK R306 | E-14 | GO

## ADDED 2026-10-01 (Lead) — after your 4 rows, in this order
5 Complaints migration for CC-2's E-28 (CC-2 is chrome-only, cannot author): claim a number in
  CLAIMED-MIGRATION-NUMBERS.json (fetch main FIRST), then: ops.complaints (or wherever E-28 put
  it — read #23610, do not guess) + load_id FK -> mdata.loads, unit_id FK -> mdata.units, and
  categories lateness / refused_dispatch / damage added to the existing CHECK or catalog. Both
  FKs indexed. RLS unchanged. Hand CC-2 the number in OUTBOX-CC-1.md.
6 Three coder TEST complaints live in USMCA (ids from CC-2's OUTBOX): prove each is_sample_data
  or coder-authored, then void them under the standing owner order AUTH-177 (delete every voided
  and sample record, USMCA) — if AUTH-177 is CONSUMED/expired, write the dry run + the 3 ids to
  OUTBOX-CC-1.md and STOP; the Lead gets the owner's word. Never a real complaint.
7 Fresh-database migrate fails on a pm_intervals foreign key (CC-2 report, main CI red):
  reproduce on a scratch Neon branch, fix the ORDER or the FK (never drop the FK), gate, merge.
8 CI readonly DB password rejected on main: you rotated ih35_ci_readonly 2026-09-28 22:03Z; the
  GitHub Actions secret still carries the old one. Write the exact secret NAME to OUTBOX-CC-1.md;
  the owner updates it (no seat holds secrets).

## LEAD 2026-10-01 — owner, verbatim: "THE BUILDS IN MAINTENANCE ARE NOT READY, CUSTOMERS, VENDORS, AND DRIVER PROFILE."
After rows 1-8: you own every backend field Cursor needs for MAINTENANCE, CUSTOMERS and VENDORS
(read OUTBOX-CURSOR.md each round). Build fully, write no data. Codex is not a seat.
