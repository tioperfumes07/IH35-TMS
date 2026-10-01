# NOW — CC-3 (2026-10-01)
READ, in order: docs/bus/ORDERS-2026-10-01-ALL-SEATS-COMMON.md then docs/bus/ORDERS-2026-10-01-CC-3.md.
They carry your whole queue, every pending engine, the anticipated blockers and the answer to each.
Codex is not a seat. Build fully; write no business data; owner seeds when engines are complete.
ACK by appending to OUTBOX-CC-3.md: `CC-3 | ACK ORDERS-2026-10-01 | <first row> | GO`
OWNER 2026-10-01: NO HANDOFFS. Read docs/bus/2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md — you own your engine end to end (migration in your own band, backend, screen). Gate: LANE_CROSS=2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md

OWNER 2026-10-01 (verbatim): "get all coders building non stop, go lets go." No idle: when your row is DONE, take the next row in your ORDERS file without asking; when ALL rows are DONE, write "QUEUE EMPTY + proof" to OUTBOX and start the first "addition" in the registry sheet for your own engines.
LEAD DECISIONS 2026-10-01 (owner delegated: "all to you"), each needs the live proof in OUTBOX after:
ON after the Lead's backend deploy: SAMSARA fuel push (E-23, 22 fills; twice daily), ROUTES (E-31, 16 loads), DRIVER MESSAGING (E-30). OFF stays: auto-status (rewrites load status), master sync (96/96 runs failing on dup VINs/numbers/deadlocks — fix the root cause: dedupe by VIN+number with a unique index and upsert, prove 0 failures on a rolled-back run, then ask again).
APPROVED, do now, one script each with dry run counts then --apply + audit row: T122 stored Samsara id correction (1 row); delete the 176,960 duplicate telematics.odometer_readings (keep the earliest per unit+captured_at+odometer, prove the survivor count = distinct keys); apply the 30 fence-address links (T-46); MERGE the 5 clear driver duplicates through the existing merged_into_driver_id path (never delete) — the 27 inactive pairs stay reported, owner's call.
BUILD: the 5 Laredo bridges as border fences (World Trade, Colombia Solidarity, Juarez-Lincoln, Gateway to the Americas, Camino Real) from real coordinates, kind border_crossing, 400 m. E-09: repoint the 7 readers of dispatch.stop_arrivals to geo.geofence_events (load-stop fences, E-25) one by one, then retire the table — the Lead signs the retirement when reader count is 0.
