# NOW — CC-3 — trimmed 2026-09-30T16:05Z (bus cap)

Archived (full content, all prior T-01/T-20/T-21 order text): `docs/bus/archive/NOW-CC-3-2026-09-30-r294c.md`.

## 2026-09-30 — T-01 IS OFF YOUR QUEUE. LEAD BUILT IT (PR #23410).
ACKed in `docs/bus/OUTBOX-CC-3.md`. Do not touch
`apps/backend/src/integrations/samsara/samsara-positions.service.ts` or
`apps/backend/src/telematics/arrival-detection.service.ts` until #23410 merges.

## YOUR QUEUE NOW, IN SEQUENCE: T-02 -> T-03 -> T-04 -> T-05 -> T-21 -> T-06 onward
- T-02: once #23410 merges, re-measure the Truck Line board — every rolling load must show
  real progress. PROOF: board screenshot + per-load stamp counts.
- T-03: DONE, reported in OUTBOX — could not reproduce catalog_ready=false live (backend
  7291c8e, frontend 15b2636, both current); 11 active reasons return correctly for Owner/USMCA.
- T-04: DONE, reported/shipped (branch claude/t04-truck-line-pending-feed) — pending_rows
  feed for booked-but-undispatched loads, LEFT JOIN units, excludes anything already in the
  top-level `rows` query so the two lists never duplicate. UI section render is separate.
- T-05: PO/WO — 13572/13578/13582 wait on the owner's rate confirmations; do not invent.
- T-21 (owner's own words): odometer at every Love's/DOT/pickup/delivery/yard-exit
  geofence crossing, SOURCE always labelled, never inferred. 604 Love's geofences active,
  clean enter/exit pairs, but odometer is NULL on all of them (the blackout) — real driven
  miles accrue FORWARD ONLY, never backfilled. NOTE: Engine A (billed/paid miles,
  `mdata.loads`) already covers settlements (MPG=7.287 today) — Engine B here is
  VERIFICATION, nothing waits on it.
- T-06 onward: driver roster reconciliation, Samsara mapping, orphan guards, PU/DEL dates,
  Maintenance tab audit, dispatch cross-module linkage — see
  `claude/orders/09-30-2026-CC-3-NEXT-15-JOBS.md` for full text.

## OWNER FREEZE — active
No production writes to loads/stops/expenses/etc, not even for proof.

## STANDING
USMCA only. Reads: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'`. No
--no-verify. NOTHING STAYS LOCAL — push same-day.
