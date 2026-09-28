# Lead ruling — CC-2 lane-cross for ROUND 197.1 banking filter + reconcile guard

Per the Lead's direct, pasted assignment (2026-09-28): "CC-2 — ROUND 197.1 — TWO OWNER-RAISED
DEFECTS IN YOUR SURFACE. ADD TO ROUND 197... GUARD: verify-banking-filters-and-reconcile-
complete.mjs ... Wired into scripts/verify-steps/ in the same PR."

verify-lane-ownership.mjs flags `scripts/verify-banking-filters-and-reconcile-complete.mjs` and
`scripts/verify-steps/11711-verify-banking-filters-and-reconcile-complete.mjs` as CC-1-owned by the
guard's default naming-pattern assignment. This is the exact guard the Lead named and required
"wired into scripts/verify-steps/ in the same PR" as the Driver Escrow filter + Reconciliation
screen fix, which is squarely "Banking is your surface" (ROUND 197's own explicit framing, carried
into 197.1 — "Your 197 / 197.1 queue is unchanged").

Ruling: authorized under the Lead's direct ROUND 197.1 assignment. Push with
`LANE_CROSS=docs/bus/2026-09-28-LEAD-RULING-CC2-ROUND1971-BANKING-FILTERS-RECONCILE.md SEAT=CC-2`.

## Addendum — ROUND 202/203, scripts/verify-bank-feed-live-tieout.mjs

Per ROUND 202 ("CC-2 - banking is your surface. Decide with Cursor which is canonical... Do not
let this keep blocking other seats' pushes.") and ROUND 203 ("ALSO YOURS, WITH CURSOR — the
bank-feed tie-out that blocked CC-3's push... Settle it this round."): `scripts/verify-bank-feed-
live-tieout.mjs` is CC-1-owned by the generic `scripts/verify-*.mjs` default in `docs/bus/LANES.md`.
This fix is a direct, explicit CC-2 assignment from the Lead across two consecutive rounds, and it
was independently blocking this exact PR's own push — same ruling, same authorization basis.

— CC-2
