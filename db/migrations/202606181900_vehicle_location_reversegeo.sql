-- Priority-1 completion: capture Samsara reverseGeo city/state on vehicle position events so the
-- fleet board / Compliance board / unit export can show CITY, STATE (not "—") for every truck.
-- The /fleet/vehicles/locations ingest only ever wrote lat/lng; the new /fleet/vehicles/stats?types=
-- gps,driverAssignments ingest carries reverseGeo.formattedLocation -> city/state here.
-- telematics.vehicle_locations is APPEND-ONLY (immutable trigger), so these columns are populated at
-- INSERT time by the new stats ingest; existing rows stay NULL until the next poll re-inserts them.
-- Idempotent. No data backfill. No RLS/security-mode change to the view (keeps its existing posture).
BEGIN;

ALTER TABLE telematics.vehicle_locations
  ADD COLUMN IF NOT EXISTS city text NULL,
  ADD COLUMN IF NOT EXISTS state text NULL,
  ADD COLUMN IF NOT EXISTS formatted_location text NULL;

-- Re-create the latest-position view to surface the three new columns. CREATE OR REPLACE VIEW can only
-- APPEND columns (existing columns must keep their name + position), so city/state/formatted_location are
-- added at the END, after raw_samsara_event_id. Preserves the view's existing security posture and the
-- existing GRANT SELECT TO ih35_app.
CREATE OR REPLACE VIEW telematics.vehicle_latest_position AS
SELECT DISTINCT ON (v.operating_company_id, v.unit_id)
  v.id,
  v.operating_company_id,
  v.unit_id,
  v.samsara_vehicle_id,
  v.captured_at,
  v.lat,
  v.lng,
  v.speed_mph,
  v.heading_deg,
  v.engine_state,
  v.raw_samsara_event_id,
  v.city,
  v.state,
  v.formatted_location
FROM telematics.vehicle_locations v
ORDER BY v.operating_company_id, v.unit_id, v.captured_at DESC, v.created_at DESC;

COMMIT;
