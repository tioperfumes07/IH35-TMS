# CC-3 — ROUND 301 STANDING QUEUE

Finish an item, ACK in OUTBOX-CC-3.md, start the next. Do not wait for a new order.
Round 300 T-23..T-28 accepted as reported. Every number below is yours, measured live.

## T-29 — PM DUE ENGINE, off the odometer ledger (OWNER ORDER, highest)
Owner, verbatim: "WE BUILT THE MAINTENANCE CATALOG ALREADY, AVERAGING 12K MILES PER MONTH
THE PM EVERY 25K MILES ... I BELIEVE TO SAVE SPACE, WE WOULD CALL SAMSARA ONLY 1 TIME A
DAY FOR THE MILEAGE ... ILL INPUT MILEAGE MANUALLY."
Build the due engine on the 03:00 CT odometer snapshot you already ship — no second poll.
Per unit: last PM odometer, current odometer, miles since, miles to 25,000, projected due
date from that unit's own trailing 90-day miles/day. NEVER from the 12K/month average —
that is the owner's rule of thumb, not a per-unit fact. A unit with no baseline PM odometer
or an odometer gap in the window returns NULL with a stated reason and renders as "—".
It never estimates and never guesses a baseline. Manual odometer entry is a first-class
writer into the same ledger with actor + source recorded, not a side table.
Guard: fails on any projected due date derived from a fleet average, any non-null result
across an odometer gap, and any second daily Samsara mileage call.

## T-30 — HARSH EVENTS + DASHCAM: build the poll fallback
Your own T-28: samsara_webhook_events 0 rows ever, 0 rejected-signature rows ever, secret
configured since 2026-08-21 — nothing has ever reached the endpoint. safety.harsh_events
has 1 row and it is a fixture (TEST-TESTMTDQ4UCF); telematics.dashcam_clips has 0.
You called the decision out of scope. I am the decision: POLL IT. Every other category
already has a poll; this is the one hole. processHarshEventsFromVehiclePayload() gets a
second caller. Do not touch the webhook path — leave it in place and leave it unused.
Guard: fails if the poller is absent, if it writes a row with no raw_samsara_id, or if a
fixture id can enter the real table.

## T-31 — T122's STALE samsara_vehicle_id
mdata.units carries an id that last reported 2024-08-21; the mirror carries the live one.
Harmless today only because loadUnitIdBySamsaraVehicleId() prefers the mirror. Repair the
hub column so both agree. FINANCIAL-adjacent data write: dry-run report first, then an
AUTH from the owner, then apply. Never write it on your own authority.

## T-32 — ODOMETER-DUP-01, dry run only
921 duplicate groups, 176,960 of 177,906 rows, retired writer already proven gone.
Produce the dedupe plan and the dry-run counts plus the unique index that makes a repeat
impossible. NO DELETES. That is an owner AUTH, same as T-31.

## T-33 — FAULT CODES INTO THE ALERT CHAIN
Owner: "WE ALL NEED TO READ SAMSARA FOR ANY ENGINE FAILURES AND FAULTS AND CODES."
J-3's poller lands the codes. Route them: unit, driver at the time (use CC-2's
driverAtTimeSql, do not re-inline it), severity, and an alert that reaches Maintenance
Home. Linkage per docs/laws/TRANSACTION-LINKAGE-LAW.md, both directions.

## T-34 — ARRIVING SOON, on Maintenance Home
Owner killed the separate tab: "ARRIVING SOON ... SHOULD BE IN THE HOME PAGE, NOT ITS OWN
TAB." Serve the feed for it: units inbound, ETA, geofence state, what is due on arrival.
Backend only — Cursor owns the screen.

## T-35 — CLOSE DAMAGE-WO-UNITS-ZERO-ASSIGNMENT-COVERAGE-2026093006
CC-2 routed it to you. All 5 units are coder test artifacts — your own T-23
KNOWN_TEST_UNIT_NUMBERS proves it. Close the finding as VOID with that proof, and report
the real pairing hole instead: T122 and T124, the two real units with zero assignment rows.

## T-36 — re-read this file.

Not yours and do not chase: T147/T170/T173 stopped reporting 2026-08-26 and need a
Samsara-side resync — that is the owner's. T-24's 03:00 CT tick fires on its own.
