-- TOUR CLOSE + GEOFENCE (owner direct instruction, 2026-09-02): "home base 23918 Mines Rd Laredo TX
-- 78045. Closeable only inside the geofence with no load."
--
-- geo.geofences (migration 0220_cap13_geofencing.sql) already supports location_kind='yard' -- this
-- migration is DATA (seeding the one home-base yard row USMCA needs), not new schema. No new tables,
-- no new columns.
--
-- COORDINATES: 23918 Mines Rd, Laredo, TX 78045 geocoded via OpenStreetMap Nominatim
-- (nominatim.openstreetmap.org/search?q=23918+Mines+Rd,+Laredo,+TX+78045), returning
-- lat=27.6514879 lng=-99.6309410. This is an ADDRESS-LEVEL geocode, not a surveyed yard-boundary
-- polygon -- Mines Rd is a rural/industrial corridor where address interpolation can be imprecise by
-- ~100-300m for an unnumbered or large-parcel property. The polygon below uses
-- squareVerticesFromCenter's SAME construction auto-geofence.service.ts already uses for load-stop
-- geofences (TMS_AUTO_GEOFENCE_SIDE_METERS = 2x the owner-locked 250ft/76.2m WF-051 arrival radius,
-- i.e. a ~152m square) -- reusing the one radius convention already in this codebase rather than
-- inventing a new number. is_active=true so the tour-close gate is live immediately; the label
-- explicitly flags this as geocoded-pending-verification so the owner can immediately spot and
-- tighten/replace the boundary in the Geofences UI (already built, telematics/geofences.routes.ts)
-- without touching code or another migration.
--
-- Idempotent: matches on (operating_company_id, location_kind, label) so re-running never duplicates
-- the row; safe on a fresh CI database (no USMCA row exists there, insert simply runs once).

BEGIN;

INSERT INTO geo.geofences (
  operating_company_id,
  label,
  location_kind,
  vertices_json,
  is_active
)
SELECT
  c.id,
  'Home base — 23918 Mines Rd, Laredo, TX 78045 (geocoded, owner should verify/tighten boundary)',
  'yard',
  '[
    {"lat": 27.65217241, "lng": -99.63171377},
    {"lat": 27.65217241, "lng": -99.63016823},
    {"lat": 27.65080339, "lng": -99.63016823},
    {"lat": 27.65080339, "lng": -99.63171377}
  ]'::jsonb,
  true
FROM org.companies c
WHERE c.short_name = 'USMCA Freight'
  AND NOT EXISTS (
    SELECT 1 FROM geo.geofences g
    WHERE g.operating_company_id = c.id
      AND g.location_kind = 'yard'
      AND g.label = 'Home base — 23918 Mines Rd, Laredo, TX 78045 (geocoded, owner should verify/tighten boundary)'
  );

COMMIT;
