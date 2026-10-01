# CC-3 — ROUND 306 · ENGINE REGISTRY
READ docs/engines/IH35-ENGINE-REGISTRY-2026-10-01.xlsx — sheet 2 SEAT SEQUENCES, your 16 rows, in order.
Owner, verbatim: each coder builds 100%, no handoff, no delegation, sequential, additions only
after that engine is DONE. Mileage/odometer/fuel first. Faults/alerts/harsh/dashcam LAST.
1 E-01 position poll: odometer decoration on every fix; T122 stale id
2 E-04 fence odometer capture: verified live; hand fence id to E-03
3 E-05 real driven miles: re-point onto E-03 stops
4 E-06 odometer snapshot: dedupe dry run -> owner AUTH -> unique index
5 E-07 Samsara address import; link the 954 fences (0 linked today)
6 E-08 ONE canonical geofence state path of the three; populate load_id on transitions
7 E-09 arrival detection on the POLL path: dispatch.stop_arrivals has 0 rows EVER -- one real row
8 E-23 Samsara fuel push 2x daily (hard gate: never gallons<=0 or a shared import stamp) + IFTA + efficiency readback
9 E-29 DOT dwell / border / auto-status: verify each against its fences
10 E-31 Samsara Routes push   11 E-32 Documents/Forms   12 E-30 driver messaging backend
13 E-10 fault poller -- ONE token path: fall back to the same SAMSARA_API_TOKEN the position poller uses, not a second secret
14 E-11 alerts   15 E-12 harsh+dashcam   16 E-13 webhook: leave unused
RULES (sheet 3): America/Chicago permanent; odometer READ or ABSENT never interpolated; no hardcoded fleet -- read telematics/live-fleet.ts; sample rows excluded at the query; linkage both directions.
MIGRATIONS APPLY ON DEPLOY (pre-deploy db:migrate). Merge the file, deploy, done. No owner step.
ACK: CC-3 | ACK R306 | E-01 | GO

## ADDED 2026-10-01 (Lead) — E-08 / E-09 ruling, read before touching either
MEASURED by the Lead: zero `load-<id>-stop-<n>` geofences have ever existed in ANY company. The
D-1 stamp path (telematics/geofence-detector.service.ts) therefore never fired. The Lead built
E-25: precision-sized circular stop fences for every board-active load, a 15-min sync cron, replay
of the unit's own GPS history for back-dated loads, stamps only from a >= 5 min dwell. ONE path.
- E-09 "arrival detection on the poll path": dispatch.stop_arrivals (arrival-detection.service.ts,
  250 ft, driver prompt) is the SECOND arrival path. Do NOT widen it or build on it. Your E-09 is
  now: prove whether anything reads dispatch.stop_arrivals (grep + live), and if nothing does,
  write the retirement ruling draft to OUTBOX-CC-3.md for the Lead to sign. No new rows.
- E-08 "ONE canonical geofence state path": the canonical path is geo.geofence_events written by
  processGeofenceDetectionsForGpsPoint. Populate load_id on those transitions by resolving the
  fence label `load-<id>-stop-<n>` — never a second detector.

## LEAD REPLY 2026-10-01 to your R304 + R306 report
ACK T-45..T-51, E-01 #23618, E-04 #23620. E-08: land it (gate 0, live run in PR). E-05: E-03
table lands in the Lead's next PR; re-point then. Codex is not a seat.
OWNER AUTH queue (Lead carries to owner; do NOT apply): T122 id fix, 176,960 odometer dupe
deletes, T-46's 30 fence links, SAMSARA_FUEL_PURCHASE_PUSH_APPLY.
OWNER, verbatim: "THE BUILDS IN MAINTENANCE ARE NOT READY, CUSTOMERS, VENDORS, AND DRIVER
PROFILE." After E-08, your queue is the DRIVER PROFILE backend Cursor needs (Cursor builds the
screen; you own every endpoint it reads), 100% each, no data writes:
1 Driver profile read model: one endpoint per tab — identity/documents/expirations, assignment
  history (driverAtTimeSql, never re-inlined), loads, stops+miles (unit_stop_events when live),
  fuel with E-21/E-22 verdicts, safety (faults, harsh, DVIRs from T-51, DOT dwell), Samsara link.
2 The 32 Samsara drivers -> 2 driver records each: REPORT the 32 pairs with the evidence of which
  record is live (loads, settlements, assignments); propose the merge; owner decides. No merge.
3 T-51 DVIR import as a scheduled engine (every 15 min, R-01, idempotent — you proved 0 dupes).
4 Then registry rows in order (E-23, E-29, E-31, E-32, E-30, E-10..E-13 last).
ACK: CC-3 | ACK NOW-CC-3 2026-10-01 | E-08 | GO
