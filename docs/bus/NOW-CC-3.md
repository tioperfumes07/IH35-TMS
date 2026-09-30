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
