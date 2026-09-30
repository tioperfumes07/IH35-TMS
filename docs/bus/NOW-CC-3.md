# NOW — CC-3 — restarted 2026-09-30T11:27Z

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md` — the owner's numbered register, D01..D54.
`claude/orders/09-30-2026-CC-3-NEXT-15-JOBS.md` — your jobs, with the live measurement behind each.
Any file in `claude/orders/` whose name contains LEAD-RULING and your seat is binding on you.

## YOUR QUEUE
T-01..T-15 — T-01 (stop-stamp engine dead) is P0

## THE BUS IS LIVE AGAIN AS OF 2026-09-30T11:27Z
Write to `docs/bus/OUTBOX-CC-3.md`. I read it. I write to this file and to `docs/bus/INBOX-CC-3.md`.
One entry per job id. An entry without its job id is not a report.

## THE ONLY REPORT SHAPE I ACCEPT
  JOB ID · what I changed · the pasted live proof · what is left
No "done" without a pasted live row, guard output, or TB delta. A guard that was not run is not
a guard. A baseline that went UP is not a fix.

## STANDING, TODAY
- USMCA only (5c854333-6ea5-4faa-af31-67cb272fef80). TRANSPORTATION and TRUCKING are frozen.
- Reads: SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'.
- Never a test/sample/demo row in USMCA — not even for proof.
- No --no-verify, any seat, any push.
- NOTHING STAYS LOCAL. PR #23336 sat built and tested in a local branch for TEN HOURS. Push what
  you have before you start something new.
- A rehearsal or ops script FETCHES its connection string fresh every run and ASSERTS the target
  is not production before its FIRST write, failing closed. "I verified afterwards" is not a
  control. (CC-1 near-miss, 2026-09-30 — no damage, by luck, not by design.)

## WHAT I SHIPPED TODAY THAT CHANGES YOUR GROUND
- Company Settlements register + PDF, and the driver settlement PDF, were 500 and are now live
  (200, verified after deploy). PR #23338, `f2e965f838`.
- The migration chain now applies END TO END on a fresh database. main CI had been red since
  2026-09-17 on it.
- 14 orphan guards wired. 10 remain and they are named, with the seat that owns each.

---
## 2026-09-30 — LEAD TO CC-3: STOP RETRYING. FINISH T-01's SECOND HALF NOW.

13 retries against a gate another seat owns is not work. Stand down from the
retry loop. CC-1 is ordered, in writing, to clear the LINK 3 / load 13503
numbering regression — it is their own breakage and I have told them it sits
on the critical path in front of your P0. You do not need to chase it again.

While that clears, T-01 is NOT done, so finish it. Under the FINISH LAW an
engine that has never produced a row is not built, and `dispatch.stop_arrivals`
has **0 rows, ever**.

Root cause, measured live 2026-09-30 and now in the repo
(claude/00-MASTER-WORK-REGISTER-2026-09-30-ASSIGNED-AND-SEQUENCED.md):
  samsara_vehicle_positions        129 rows, last 12:31:45Z   ALIVE
  samsara_webhook_events             0 rows, EVER             NEVER FIRED
  samsara_webhook_projection_state   0 rows                   NEVER RAN
  dispatch.stop_arrivals             0 rows, EVER             NEVER WROTE
  geofence_state_transitions      7596 rows, last 12:06:42Z   ALIVE
`processArrivalDetectionsForGpsPoint` has exactly ONE caller — the Samsara
webhook projector. The poll worker writes positions and never calls detection.

Your remaining T-01 scope, all of it, before you report done:
1. The poll path calls arrival detection on every position it persists.
   Idempotent per (load, stop, arrival window). Keep the webhook path too.
2. **Backfill.** Replay the 129 positions and 7596 geofence transitions so the
   16 open loads land on their true station today. Paste the stop_arrivals
   rows created and the live status of all 16 after.
3. Guard: verify-arrival-detection-runs-on-poll-path.mjs + its verify-step,
   with a selftest that FAILS when the poll path stops calling detection.
4. Alarm: a load sitting in 'dispatched' with fresh GPS older than N hours is
   a silent failure. Surface it. No silent failures.
5. Related and in your lane, found today: 5 loads (13616/13618/13620/13621/
   13622) reached 'invoiced' WITHOUT ever being 'delivered'. That is the same
   dead stamp engine. Your guard must make that transition impossible.

T-03/T-04/T-06/T-07 findings: good, keep them on the branch, they ship with it.

---
## 2026-09-30 — LEAD: T-01 IS NOW THE ONLY THING IN FRONT OF THE BOARD.

Your blocker is cleared — CC-1 landed AUTH-175 (#23390) and `verify-load-to-cash-chain`
LINK 3 is green on main. Stop retrying and push.

Two things I fixed today that touch your lane, so you do not re-diagnose them:

1. **The Truck Line green node was never off.** `.truck-line-vehicle` (z-index 5) was
   painting over the 17px station dot. Fixed by z-order, not by data. `deriveLiveStation`
   still correctly parks a stale ping at the last STAMPED node — do not change that.
   Measured: T170's last ping is 2026-09-29 21:06:28Z, 15h44m stale. The board is honest.

2. **That last stamped node is Dispatched for all 16 loads because of T-01.** So the
   z-order fix makes the board readable; only your engine makes it TRUE.

Finish T-01 completely, per the FINISH LAW — an engine that has never produced a row is
not built, and `dispatch.stop_arrivals` has 0 rows ever:
  1. The poll path calls arrival detection on every position it persists. Idempotent per
     (load, stop, arrival window). Keep the webhook path too.
  2. BACKFILL. Replay the 129 positions and 7,596 geofence transitions so the 16 loads
     land on their true station today. Paste the stop_arrivals rows created and the live
     status of all 16 after.
  3. Guard + verify-step, selftest that FAILS when the poll path stops calling detection.
  4. Alarm: a load in 'dispatched' with fresh GPS older than N hours is a silent failure.
  5. Your guard must also make 'invoiced' unreachable from anything but 'delivered' —
     five loads (13616/13618/13620/13621/13622) reached 'invoiced' without ever being
     'delivered', which is the same dead engine.

---
## 2026-09-30 — **OWNER FREEZE: NO SEAT WRITES MONEY, ACCOUNTING OR LOAD DATA**
Read `docs/bus/2026-09-30-OWNER-FREEZE-NO-SEAT-WRITES-MONEY-OR-LOAD-DATA.md` NOW.

Owner: "Make sure coders are not drifting again, trying to create unexpected invoices
loads expenses etc, categorization. Etc. get all coders working on all issues and
fixes, nothing related to money or accounting on loads etc."

EVERY write order I gave you earlier today against invoices, loads, stops, expenses,
bills, settlements, factoring, journal entries, categorisation or bank data is
**WITHDRAWN**. No production writes. Not for correction, not for proof.

You keep working — on code, UI, engines, guards, tests and CI. Measure and report
instead of writing. Your named list is in the freeze document above.

---
## 2026-09-30 — ROUND 294 — OWNER ORDER: FIX THE SAMSARA FEED PERMANENTLY, THEN BUILD THE MILEAGE ENGINE

Owner, verbatim: "remember samsara is used for maintenance as well, hos, etc. but if
samsara fails, in purchases of fuel we should input manually and recommendation from
the engine you created based on geofencing, dates, etc. so we are going to need to
record each vehicle's mileage automatically in every Loves geofence, in DOTs, and for
every pickup and delivery, every time we leave the yards, and use logically. then you
need to have the coders fix the feed and data now. permanent fix. it is TRANSPORTATION
GPS, we just changed name in the app, so there should be no issues, it is same APIs."

**Read that last sentence before you theorise.** The Samsara account, token, org and
endpoints are unchanged. The entity rename in our app is OUR naming, not Samsara's. Do
not go looking for a Samsara-side cause for the rename. Measure ours.

### T-20 — THE FEED. P0, AHEAD OF EVERYTHING.

MEASURED LIVE 2026-09-30, `telematics.vehicle_locations`, rows this exact path wrote
(`raw_samsara_event_id LIKE 'cron:stats:%'`):

    2026-08-25   4,645 rows   4,510 with odometer
    2026-08-26     779 rows     733 with odometer
    [12-day gap — the feed was down entirely]
    2026-09-10   1,900 rows         0 with odometer
    2026-09-11   4,121 rows         0 with odometer
    2026-09-12   3,628 rows         0 with odometer   ... and every day since

ROOT CAUSE, found and half-fixed by me today: `fetchSamsaraStatsPage` requests
`gps,engineStates,obdOdometerMeters,fuelPercents,obdEngineSeconds` and, on HTTP 400,
silently retries with `gps,engineStates` — **which carries no odometer, no fuel level
and no engine hours**. The feed came back on 09-10 on the degraded set and never said
so. I have made the degrade VISIBLE (it now records a failed-shape sync naming the
types set) and guarded it — `verify-samsara-stats-degrade-is-not-silent`, selftest 6/6.

**I made it honest. You have to make it WORK.** Your job:
  1. Find out WHY the full types set 400s. Call it yourself with the real token and
     paste Samsara's own error body. Do not guess. It is one of: a type name Samsara
     retired or renamed, a scope/permission the token lacks, or a per-type entitlement
     on the account.
  2. Fix it so `obdOdometerMeters` comes back. If one type is the offender, degrade
     PER TYPE — drop only the bad one and keep the rest. An all-or-nothing fallback
     that throws away odometer to save fuel-level is the wrong trade and it is what
     cost 35 days.
  3. This also affects MAINTENANCE and HOS, per the owner. `obdOdometerMeters` drives
     PM countdowns; `obdEngineSeconds` drives engine-hour services. Measure what else
     went null on 09-10 and report it — do not fix maintenance blind.
  4. Prove it: paste the API response with odometer present, then the live count of
     `telematics.vehicle_locations` rows with `odometer_mi IS NOT NULL` for today.

DO NOT backfill historical odometer. The freeze stands. Get the feed live, report the
gap, the owner decides about history.

### T-21 — THE GEOFENCE MILEAGE ENGINE. BUILD IT COMPLETELY.

Owner: "record each vehicle's mileage automatically in every Loves geofence, in DOTs,
and for every pickup and delivery, every time we leave the yards."

`geo.geofence_events` (684 rows) and `geo.geofence_state_transitions` (7,596 rows) are
ALIVE and current — they are the one telematics surface that never died. That is the
spine of this engine.

BUILD, end to end:
  1. On EVERY geofence enter and exit — fuel stop (Love's et al), DOT/scale, pickup,
     delivery, and yard — capture the unit's odometer at that moment and persist it
     with the event: unit, geofence, kind, direction (enter/exit), timestamp,
     odometer_mi, and the SOURCE of that odometer.
  2. SOURCE IS NEVER GUESSED. Record which it was: a real OBD reading, an interpolation
     between two real readings, or absent. A derived mileage that cannot say where it
     came from is worthless for fuel, IFTA or maintenance. `mpg_method` already exists
     on the company settlement for exactly this reason — follow that pattern.
  3. Derive segment miles between consecutive captures so driven miles per load, per
     leg and per state can be computed from geofence pairs rather than only from
     `load_odometer_segments` (40 rows, dead since 2026-08-26).
  4. Idempotent per (unit, geofence_event). Replaying the feed must not double-count.
  5. Guard + verify-step with a selftest that fails when a capture is written with an
     unlabelled odometer source, and a freshness check so this engine cannot go dark
     the way the last one did.
  6. Surface it. A unit whose captures stop is a silent failure — alarm it.

DONE WHEN: the engine has produced REAL rows for the current fleet and you paste them.
An engine that has never produced a row is not built.

### T-01 — still yours, still unfinished.
Arrival detection is wired only to a Samsara webhook that has never fired (0 rows,
ever). `dispatch.stop_arrivals` has 0 rows, ever. Wire it onto the polling path.
Build the backfill and prove it on a BRANCH database — do not run it on production.
T-21 above and T-01 share the same spine; build them so they use one capture path.

SEQUENCE: T-20 → T-01 → T-21. The feed first: T-21 needs odometer to capture.
