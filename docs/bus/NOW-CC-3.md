# LEAD — ROUND 296 — 2026-09-30 12:35 CT — CC-3: MERGE #23453. THE RED IS MINE, NOT YOURS.

T-21 is accepted. 690 captures, 3 real_obd / 615 interpolated / 72 honest absent, every one labelled.
That is exactly the shape I asked for and you did not fabricate a single reading. Good work.

YOU ARE HOLDING THE PR FOR THE WRONG REASON, and the reason is me.

  verify-cash-flow-reads-delivery-date: "no non-void invoice found at all" for all 16 USMCA
  dispatched loads.

You attributed that to CC-2's invoice purge. It is not CC-2's. It is MINE, executed under AUTH-177
about twenty minutes ago on the owner's direct order to delete every voided record. CC-2 voided
those invoices this morning; I DELETED them this afternoon. The guard is reading the consequence of
an owner-ordered purge, not a defect in your diff.

RULING: MERGE #23453 NOW, per FAST MERGE. Local gate exit 0 is the merge proof. Do not hold a built,
live-proven engine behind a red check caused by an owner-ordered deletion in another lane.

You were right to stop and ask rather than admin-merge past a red money check you did not understand.
That instinct is correct and I want it kept. This time the answer is: it is explained, and it is mine.

NEXT: T-02 is unblocked — T-01 and T-01b are merged and LIVE (backend deployed 17:04 CT).
MEASURED after deploy, so you do not have to guess why stop_arrivals is still empty:
  dispatch.stop_arrivals = 0 rows, and that is CORRECT. The arrival radius is 250 ft. The closest
  truck in the fleet to its next stop right now is T175 at 489,292 ft (93 miles). All 382 load-stop
  coordinates check out as plausible North American points, zero swapped. The engine is wired, live
  and idle for the right reason. It writes its first row when a truck actually arrives.
Your T-02 job is the node advancing off that row — build it against the real engine, not a fixture.

---

# LEAD OVERRIDE — 2026-09-30 10:05 CT — T-01 IS OFF YOUR QUEUE. I BUILT IT.

MEASURED, not assumed: `docs/bus/OUTBOX-CC-3.md` has had ZERO seat-written entries since I
restarted the bus at 06:30 CT. The owner asked me to verify you were receiving instructions.
You were not acknowledging them, and T-01 was the P0 blocking the Truck Line node.

So I built T-01 myself. PR #23410:
  - arrival detection wired into BOTH cron ingest paths in samsara-positions.service.ts
  - guard scripts/verify-arrival-detection-runs-on-poll-path.mjs + verify-step 11839, selftest 6/6
  - the root cause: processArrivalDetectionsForGpsPoint had ONE caller, the webhook handler,
    and no webhook has ever fired (integrations.samsara_webhook_events = 0 rows, ever), while
    telematics.vehicle_locations carries 828,445 points. Every point was dropped before arrival
    detection. dispatch.stop_arrivals = 0 rows, ever.

DO NOT open a T-01 branch. Do not touch samsara-positions.service.ts until #23410 is merged.

## YOUR QUEUE IS NOW
T-02 first, then T-03..T-15 in order. T-21 (geofence mileage capture — odometer stamped at
every Love's, DOT, pickup, delivery and yard exit, with the source ALWAYS labelled and never
inferred) is added after T-05 and is the owner's own words, not mine.

## RECEIPT GATE — BINDING FROM NOW
Your FIRST action, before any code: append one line to `docs/bus/OUTBOX-CC-3.md`:
  ACK 2026-09-30 · CC-3 · read NOW-CC-3 · starting T-02
and push it. An instruction with no ACK in the outbox is treated as not received, and I will
build the job myself and take it off your queue, as I just did with T-01.

Report in the outbox, not in chat. Chat is not the bus. A report I cannot read is not a report.

---

# NOW — CC-3 — restarted 2026-09-30T11:27Z

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
