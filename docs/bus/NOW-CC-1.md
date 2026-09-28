# ROUND 155.23 JOB 1+2 DONE (live-proven); 155.26/157-A correction executed (AUTH-095); multiple items blocked on 155.20 JOB 2 — CC-1 — 2026-09-28 10:25Z
Archived: `docs/bus/archive/NOW-CC-1-2026-09-28-16.md`.

## SAFETY CONFIRMATION (per ROUND 157's "nothing attached to an open pre-settlement is ever touched")
Confirmed: I never voided or touched 13609/13616/13617/13618/13620/13621 (the 6 delivered loads on
open pre-settlements P-0004/0008/0002/0009/0010/0011 with live open driver bills). The only loads I
voided were 13623/13625/13627/13638 (AUTH-093, ROUND 155.20 JOB 1) — none of which had a settlement
or driver bill at the time. 13625/13627/13638 are now REINSTATED (AUTH-095, below); 13623 stays
voided, independently confirmed against AlwaysTrack too.

## ROUND 155.23 JOB 1 + JOB 2 — DONE, live-proven
Pre-Settlement/tour-readout for a load now groups by tour_id ONLY (never driver_id/unit_id) and
excludes closed loads from an open settlement's legs/totals. Fixed in
apps/backend/src/driver-finance/tour-readout.routes.ts: the per-load route short-circuits to an
honest "this load is not on a tour" response when the subject's own tour_id is NULL (never falls
through to presettlement_link_id/first_load_id/last_load_id); buildTourReadout takes a new
`scopeToTourId` param that hard-filters legs to that exact tour_id and excludes closed loads when
the settlement is open.
LIVE PROOF (real data, not synthetic): 13609 (tour_id NULL) -> honest "not on a tour", zero legs.
Scoped to 13614's real tour (b19dda01) -> zero legs (13614 is closed, correctly excluded from open
settlement 2ef96b64). Scoped to 13639's real tour (8ebae567) -> exactly [13639], no cross-tour
contamination.
Guard scripts/verify-presettlement-shows-only-this-load-and-its-open-tour.mjs: selftest 5/5 PASS,
live PASS. Wired into money-pr-local-gate.mjs's always-run STEPS.
NOT DONE from 155.23/157-A item 6: 13614's LAREDO->LAREDO lane fix (needs its real source
document, not yet located) and the two additional named guards
(verify-tour-groups-by-tour-id-only.mjs, verify-stop-lane-is-consistent-with-miles.mjs) — not
written since the underlying lane data isn't fixed yet; writing a guard for an unfixed defect
would be theater.

## ROUND 155.26/157-A item 1/3 correction — DONE, AUTH-095
Investigated 13623 per the owner's explicit instruction: confirmed absent from the AlwaysTrack
ground-truth table (13624-13639 only) AND from the FARO/AlwaysTrack cross-reference exports in
Downloads. Stays voided — "a load we created that never existed" (its customer is real, borrowed
from other unrelated loads; this specific load/WO never was).
REINSTATED 13625, 13627, 13638 — AlwaysTrack (the primary control) confirms all three are real,
live, open loads; my earlier AUTH-093 void of them was wrong. Load status restored to 'dispatched',
the 13627 trailer_interchange un-voided, a new audit event documents the reversal, the original
(mistaken) cancellation record stays on file as history, untouched.
customer_wo_number backfilled for all 16 real loads (13624-13639) from AlwaysTrack — no
disagreement with our existing data.

## ROUND 155.26/157-A item 3 (units/trailers/drivers/customers from AlwaysTrack) — PARTIALLY DONE, rest BLOCKED
Only 13631's unit (T174) could be written — zero conflict. The other 11 missing units are BLOCKED
by a real DB invariant (uq_loads_one_active_unit: a truck can hold at most one active load) for two
separate reasons: (a) 7 of the needed trucks (T173/T171/T176/T156/T168/T175/T164) are still
actively held by the stale delivered-but-never-advanced loads (13609/13616/13617/13618/13620/
13621/13622); (b) 3 pairs of the 16 real loads share one truck for a second/later leg (T156:
13626+13629, T152: 13633+13634, T176: 13638+13637) and both legs currently sit frozen at
'dispatched' simultaneously. Both reasons trace to the SAME root cause as 155.20 JOB 2: no stop has
ever been stamped, so status never advances and a truck's "current load" never rotates. Forcing
these through would misrepresent a truck as being on two loads at once, or steal a unit from a
still-genuinely-active delivered load. Correctly held, not silently dropped.
Trailers, drivers and customers already matched AlwaysTrack exactly on all 16 — nothing to correct
there (checked, not assumed).
Lane data (JOB 3/155.26): all 15 remaining lanes (13639 already confirmed correct) match
AlwaysTrack's origin/destination exactly, modulo capitalization only — zero real disagreements.

## STILL BLOCKED / NOT STARTED — all trace to ONE root cause
- 155.20 JOB 2 / 157-A item 2 (stamp-writer diagnosis): not started. This is the actual
  prerequisite for almost everything else remaining — advancing the 6-7 stale loads, freeing their
  trucks for the real 16, and closing tours all depend on it.
- 157-A item 1 (advance 13609/13616/13617/13618/13620/13621 through the real state machine): I have
  NO real delivery-evidence source for these (no AlwaysTrack API access, no per-load actual
  arrival/departure export found in Downloads yet — checked 09-25-26-CUSTOMER CHARGES.xlsx, it
  carries revenue by load, not delivery timestamps). Per the owner's own "never invent a stamp"
  rule, holding all of these, not advancing any.
- 155.12 FIX 2(c)/(d)/FIX 4 (mileage backfill + $0-bill correction for 13618/13621): FIX 4
  investigation found 13618/13621 already have real miles+rate but a stale $0 bill AND their
  settlement_lines are already is_active=false with no voided_at — an unexplained pre-existing
  state that blocks the standard correctOpenDriverBillMileage path. Not resolved.
- 155.12 FIX 1/2(a)/2(b) and 155.20 JOB 1's core (source-document proof for 14/18 loads) are
  already shipped (PR #22954, merged aec8bfdd).

Everything above is queued to resume in this order once 155.20 JOB 2 unblocks: stamp-writer fix ->
advance the 7 stale loads -> free their trucks -> finish the remaining 11 unit assignments -> FIX 4
-> remaining mileage backfill -> 13614's lane fix -> the last two 155.23 guards.
