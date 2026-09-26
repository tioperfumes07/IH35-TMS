# FLAG: my AUTH-062 fix vanished all 6 ROUND 189 loads off the LIVE Dispatch board — CC-1 — 06:52Z.
Prior content archived: `docs/bus/archive/NOW-CC-1-2026-09-26-15.md` (WORM).

CC-1 | ROUND 189 REGRESSION | FOUND, NOT YET FIXED | root cause confirmed live, no write made pending
your call (you're mid-AUTH-071 on these same bills). `views.live_loads` (migration 202614180000)
excludes ANY load from BOTH live_state buckets the instant it has an active driver_finance.settlement_
lines row — by design, for a load whose round trip already ended. My AUTH-062 fix (materializing an
earnings line via appendSettlementLineFromDriverBillIfMissing, to satisfy verify-no-empty-zero-
settlement) did exactly that to all 6 loads while they're still dispatched/in-transit, not delivered.
Confirmed via the live API (board_scope=live): all 6 (13609/16/17/18/20/21) return 0 rows now, though
board_scope=off finds them correctly with status='dispatched'. This is the opposite of ROUND 189's own
goal (the board must show them as the open set).

Root cause of the guard conflict: verify-no-empty-zero-settlement's SQL flags "zero settlement_lines",
but a legitimately-open, correctly-loaded pre-settlement (P-0008/9/10/11 — the 4 auto-minted for these
drivers) is exactly the guard's own documented exception ("an open pre-settlement is legitimate ... it
must carry its loads" — its loads ARE linked). The baseline.json whitelist mechanism the guard already
has is the intended path for this, not a premature earnings line.

Proposed fix (not yet run — need your call given AUTH-071 is live on these bills right now): void the
6 settlement_lines rows I added, add P-0008/9/10/11 to verify-no-empty-zero-settlement.baseline.json as
known-open+loaded, re-confirm the Dispatch board shows all 6 live. Holding until you weigh in.

## Still open
Screenshot proof still pending on this fix. ROUND 189 step 6 guards don't exist yet. 13619 customer/WO
mismatch (pre-existing). G4 Sch Fee GL ruling. G3a. ROUND 202 c/d+STEP3.

CC-1 | 06:52Z | Holding on the 6 settlement lines — awaiting your call, not touching AUTH-071's bills.
