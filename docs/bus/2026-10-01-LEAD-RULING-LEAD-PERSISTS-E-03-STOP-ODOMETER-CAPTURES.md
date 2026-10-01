# LEAD RULING 2026-10-01 — Lead persists E-03 stop-odometer captures (unit_stop_events)

Owner order (2026-09-30, verbatim intent): "record the miles or odometer each time it stops for more
than three to five minutes. Build the engine fully and completely done, fully wired, linked to every
single truck, to every single geofence, triggering automatically." Registry sheet 2 assigns E-03 to LEAD.

Lane cross declared: db/migrations/202615030000_unit_stop_events.sql (CC-1 band HH 00–11, number
claimed in CLAIMED-MIGRATION-NUMBERS.json via chore/claim-reserve-unit-stop-events), plus
apps/backend/src/telematics/unit-stop-events.writer.ts, apps/backend/src/cron/unit-stop-events.cron.ts
and the two-line registration in apps/backend/src/index.ts (telematics has no assigned seat).

What it does: every 15 min (America/Chicago, R-01) the writer reads the last 36 h of
telematics.vehicle_locations for the measured live fleet (live-fleet.ts, evidence-based, never by unit
number), runs detectStops / attachNearestOdometer / milesBetweenStops from
stop-odometer-capture.service.ts, resolves the geofence the stop sits inside, the driver and load at
the stop start (driverAtTimeSql, shared LATERAL), and UPSERTs telematics.unit_stop_events on
(unit_id, started_at). No Samsara call is made by this cron (R-06). Negative odometer deltas are HELD
(miles NULL + note), never written as miles.

Linkage: unit_id -> mdata.units; driver_id_at_time -> mdata.drivers; load_id_at_time -> mdata.loads;
geofence_id -> dispatch geofences; operating_company_id -> org.companies. RLS policies mirror
telematics.load_odometer_segments. GRANT SELECT, INSERT, UPDATE to ih35_app; no DELETE.

Not money: no journal, no settlement, no AR/AP write. Owner's pause on creating/moving transactions
is untouched.
