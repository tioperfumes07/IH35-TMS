-- GAP-26: Border crossing 1000m geofence events + customs clearance time tracking.
-- Tracks GPS-detected crossings at Laredo-area border bridges.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.border_crossing_events (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT NOT NULL,
  vehicle_id TEXT NOT NULL,
  driver_uuid UUID,
  load_uuid UUID,
  crossing_point TEXT NOT NULL CHECK (crossing_point IN ('laredo-i','laredo-ii','laredo-iii','laredo-iv','colombia','other')),
  direction TEXT NOT NULL CHECK (direction IN ('northbound','southbound')),
  entered_geofence_at TIMESTAMPTZ NOT NULL,
  exited_geofence_at TIMESTAMPTZ,
  customs_clearance_minutes NUMERIC GENERATED ALWAYS AS (
    CASE WHEN exited_geofence_at IS NOT NULL
    THEN EXTRACT(EPOCH FROM (exited_geofence_at - entered_geofence_at))/60
    ELSE NULL END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bce_vehicle_time
  ON dispatch.border_crossing_events(vehicle_id, entered_geofence_at DESC);
CREATE INDEX IF NOT EXISTS idx_bce_company_time
  ON dispatch.border_crossing_events(operating_company_id, entered_geofence_at DESC);

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.border_crossing_events TO ih35_app;

COMMIT;
