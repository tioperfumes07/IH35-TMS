# LEAD RULING 2026-10-01 — E-25: load-stop geofences are the ONE automatic arrival path

MEASURED (live USMCA 2026-10-01): geo.geofences with label `load-<id>-stop-<n>` = 0 rows in ANY
company, ever. The only automatic actual_arrival_at writer (telematics/geofence-detector.service.ts,
D-1) joins on that label, so it never fired. bindLoadToGeofences ran at booking, before stops had
coordinates; nothing re-bound after geocoding; and its fence was a 250 ft diamond (inscribed ~54 m)
while trucks dock 90–320 m from a rooftop pin (13626 Walmart Mebane 89–295 m; 13637 Wilkes-Barre
~293 ft; 13626 Newcold ~321 m). 16 dispatched loads / 33 geocoded stops / 1 stamped.

BUILT (Lead, own engine, end to end): load-stop-geofence-geometry.ts (precision-sized circle: rooftop/
range 400 m, geometric/approximate 600 m, locality = NO fence), bindLoadToGeofences rewritten on it
(idempotent on center, refresh on re-geocode), load-stop-geofence-sync.service.ts (sync every
board-active load, replay the assigned unit's own GPS history for new fences through the canonical
detector with suppressOperationalSideEffects, stamp from a >= 5 min dwell -- FLAG OFF
LOAD_STOP_RETRO_STAMP_ENABLED per the owner's 2026-10-01 freeze -- retire fences of inactive loads),
cron 4,19,34,49 America/Chicago, tests on the geometry.

LANE CROSS declared: apps/backend/src/dispatch/geofences/* (dispatch), apps/backend/src/telematics/*,
apps/backend/src/cron/*, apps/backend/src/index.ts -- all for the Lead's own registered engine E-25,
under 2026-10-01-LEAD-RULING-EACH-SEAT-BUILDS-ITS-ENGINE-END-TO-END.md.

Linkage: fence label -> mdata.loads + mdata.load_stops; geofence_events.unit_id -> mdata.units;
stamps -> mdata.load_stops; audit.audit_events per stamp. No money: the live D-1 path's proforma
mint is governed by INVOICE_PROFORMA_PIPELINE_ENABLED (owner's flag) and retro stamps never mint.
