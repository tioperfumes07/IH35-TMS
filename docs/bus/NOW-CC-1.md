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
