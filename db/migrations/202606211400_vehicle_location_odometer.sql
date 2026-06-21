-- Block E #13 / FINISH-OPS #7 — capture Samsara odometer (miles) on vehicle position events so the PM
-- countdown / maintenance predictor have a LIVE odometer per unit (no manual entry; Samsara is the single
-- source for ODO/MPG). The stats ingest already writes gps + engine + reverseGeo city/state; this adds the
-- odometer carried by /fleet/vehicles/stats?types=...,obdOdometerMeters (meters -> miles at ingest time).
-- telematics.vehicle_locations is APPEND-ONLY (immutable trigger), so odometer_mi is populated at INSERT
-- time by the stats ingest; existing rows stay NULL until the next poll re-inserts them. Idempotent. No
-- data backfill. No RLS/security-mode change to the view (keeps its existing posture).
--
-- Mirrors the proven 202606181900_vehicle_location_reversegeo.sql pattern exactly (ADD COLUMN IF NOT
-- EXISTS + CREATE OR REPLACE VIEW appending the new column at the END — CREATE OR REPLACE VIEW can only
-- APPEND, existing columns must keep name + position). Reversible: the column is additive/nullable.
BEGIN;

ALTER TABLE telematics.vehicle_locations
  ADD COLUMN IF NOT EXISTS odometer_mi double precision NULL;

-- Re-create the latest-position view to surface odometer_mi. APPENDED at the END (after
-- formatted_location) so existing view columns keep their name + position. Preserves the view's existing
-- security posture and the existing GRANT SELECT TO ih35_app.
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
  v.formatted_location,
  v.odometer_mi
FROM telematics.vehicle_locations v
ORDER BY v.operating_company_id, v.unit_id, v.captured_at DESC, v.created_at DESC;

COMMIT;
