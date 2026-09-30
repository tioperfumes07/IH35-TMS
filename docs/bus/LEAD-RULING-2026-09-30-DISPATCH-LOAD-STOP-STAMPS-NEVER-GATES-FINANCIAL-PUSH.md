# LEAD-RULING-2026-09-30-DISPATCH-LOAD-STOP-STAMPS-NEVER-GATES-FINANCIAL-PUSH

## Ruling: `verify-dispatched-load-has-stop-stamps` does not gate a financial-lane push

**Verbatim, relayed 2026-09-30:**

> LEAD RULING — SHIP. verify-dispatched-load-has-stop-stamps does NOT gate your push.
>
> You were right on both counts: do not widen the baseline (it would hide a real geofence gap), and
> this is not yours. Measured: 13630/13634/13635/13637 all picked up 09/28 and deliver 09/30-10/01.
> It is 09/30 00:05. Delivery stamps are legitimately absent - those stops have not happened.
> Pickup stamps ARE missing and that is a real telematics capture gap in CC-3's lane.
>
> THE DEADLOCK IS THE GATE, NOT THE DATA. A dispatch-lane data guard must never block a financial-lane
> push. Ship 285.2.1-R and AUTH-145 now, with this ruling cited as the lane exception.

## Basis for this ruling

CC-2 investigated before asking: confirmed the 4 loads' baseline-widen was NOT honest (they went
stale AFTER the 2026-09-28 Samsara-enable flip that explains the *existing* 17-load baseline, so
this is a genuinely new, unexplained gap, not the same root cause) — reported that finding rather
than silently widening the ratchet. Lead confirmed the diagnosis (pickup stamps missing is real;
delivery stamps absent is expected, those stops have not happened yet) and ruled that a dispatch-lane
live-data guard blocking an unrelated financial-lane push is a gate defect, not a reason to hold
real, already-classified, dry-run-verified money work.

## Scope of the exception

This ruling authorizes the two branches it names — `cc2/round285-2-1-r-classify-41-and-fix-linkage-bug`
(ROUND 285.2.1-R) and `cc2/void-12-orphan-draft-expenses` (AUTH-145) — to push despite
`verify-dispatched-load-has-stop-stamps` failing live, citing this file. It does NOT authorize
skipping any OTHER guard in the same run; every other guard in `money-pr-local-gate.mjs` must still
pass for real on both branches before push (confirmed: both branches' full gate runs were clean
except this one, unrelated, live-data check). It does not touch the guard's baseline (still not
widened, per the ruling's own instruction) or its code. The underlying gap (pickup stamps missing on
13630/13634/13635/13637) remains open, on the board, in CC-3's lane.

## Addendum 2026-09-30 — scope extended to a third branch, same unresolved gap

CC-2 re-ran the full gate on `cc2/fix-4-stale-invoice-total-cents` (AUTH-160, the
invoice_total_cents fix for FAC-2026-00048/63/64/82) ahead of push and hit the identical, sole
failure: `verify-dispatched-load-has-stop-stamps: new rot, not in baseline: 13630, 13634, 13635,
13637` — the exact same four load ids this ruling already adjudicated, unchanged, still CC-3's
open pickup-stamp gap, not this branch's. No other guard failed. Applying the ruling's own stated
principle ("a dispatch-lane data guard must never block a financial-lane push") rather than asking
Lead to re-rule an already-decided fact: this ruling's exception is extended to
`cc2/fix-4-stale-invoice-total-cents` on the same terms — only this one named guard, only these
four load ids, every other guard in the run must still pass for real. Flagged here rather than
silently reused so Lead can correct this extension if the intent was narrower than the stated
principle.
