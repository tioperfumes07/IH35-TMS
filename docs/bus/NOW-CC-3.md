# CC-3 — ROUND 303 (money paused; you were already fully in scope)

Read 09-30-2026-ALL-SEATS-OWNER-SCOPE-CHANGE-MONEY-STOPS.md first.
Nothing of yours is paused. Every item you hold is a maintenance or dispatch engine.

## T-37 — THE PM CRON WRITES AGAINST A FAKE TRUCK (still your top item, it is a LIVE writer)
maintenance.pm_schedules 756b5701-9ed2-4402-b6d6-086fd133af98, USMCA, unit T-TESTMTDP79YF,
is_sample_data TRUE, is_active TRUE, next_due_odometer 1, last_service_odometer 1.
Permanently overdue and active, so the PM auto-WO cron creates a work order against a truck that
does not exist, inside USMCA, on every tick, forever.
CODE (yours, now): listActiveSchedules and every PM auto-WO selection must exclude
is_sample_data. A writer that CAN reach a sample row is a defect whether or not one exists today.
DATA (owner AUTH, dry run first): deactivate that one schedule. Keep the two apart.
T-29 tie-in: last_service_odometer = 1 is a placeholder, not a baseline. A baseline of 1 mile is
a guessed baseline wearing a number. T-29 must treat it as ABSENT and return NULL with a reason.

## T-40 — THE DISPATCH NODE HAS NEVER ADVANCED. THIS IS THE BIGGEST HOLE YOU OWN.
dispatch.stop_arrivals has 0 rows. Ever. The truck-line graphic moves, the arrival engine T-01
is built and merged, and no stop has ever been recorded as arrived. T-01's only caller is the
webhook -- and you proved the webhook has never delivered a single request since 2026-08-21.
So arrival detection exists and has never once run.
You already fixed the same class in T-30 by polling instead of waiting on the webhook. Do it
here: arrival detection on the POLL path, using positions and geofences, which you proved are
current and healthy. Full linkage: stop -> load -> unit -> driver-at-time via driverAtTimeSql.
DONE = a real stop_arrivals row from live data, pasted, with the load and unit it belongs to.

## T-41 — GEOFENCE MILEAGE CAPTURE (T-21, still NOT BUILT)
604 Love's geofences active, clean enter/exit pairs. This is how real driven miles get captured
without trusting a single odometer read. Feeds the PM engine and the integrity engine.

## T-42 — ARRIVING SOON on Maintenance Home
Backend feed only -- Cursor owns the screen, and Maintenance is already at 9 tabs (C-36).
Units inbound, ETA, geofence state, what PM or work order is due on arrival.

## T-43 — SAMSARA_TOKEN_ENCRYPTION_KEY: one note, not three UNVERIFIED lines
T-26, T-30 and T-33 all end on the same unset variable. You were right to refuse to claim proof
three times. Write ONE note: the variable, where it is set, what breaks without it, what the
first real tick proves. Then point at the note. It is with the owner.

## T-44 — re-read this file.
LANE: no apps/frontend, no accounting schemas, no money paths.
