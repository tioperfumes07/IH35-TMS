# LEAD-RULING-2026-09-23-CC3-LOVES-GEOFENCE-GUARD-CROSS-LANE

## Lane-cross authorization for CC-3 authoring `scripts/verify-loves-geofences-seeded.mjs`
## (CC-1's `scripts/verify-*.mjs` lane)

**Authorization, quoted verbatim** from the Lead's own Round 33.1 assignment to CC-3:

> "=== LOVE'S 604 GEOFENCES — NEVER BUILT === ... BUILD BOTH HALVES, ONE PR: 1. mdata.locations
> ... 2. geo.geofences ... 3. GUARD: scripts/verify-loves-geofences-seeded.mjs FAIL if any
> mdata.locations LOVES-% row has no linked active geofence; FAIL if any external_source
> geofence has NULL location_ref_id. Selftest RED before GREEN — make the red case a real
> assertion, not vacuous."

This is a new guard authored as part of the same explicitly-assigned build, not a preemptive or
self-initiated lane cross — the Lead named the exact filename and the exact two assertions.

## Scope of the cross

One new file, `scripts/verify-loves-geofences-seeded.mjs`, live-DB-optional (skips cleanly with no
`DATABASE_URL`, per this repo's established convention), asserting exactly the two conditions
above, with a pure-function core (`checkLovesGeofencesSeeded`) so `--selftest` proves both failure
modes on synthetic fixtures before the live half runs against real data.
