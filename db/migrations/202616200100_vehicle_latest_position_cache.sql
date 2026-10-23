-- D074: replace telematics.vehicle_latest_position VIEW (full-scan, 109MB sort) with a
-- one-row-per-unit cache table updated by an AFTER INSERT trigger on vehicle_locations.
-- Target: all 4 slow APIs (truck-line 11.4s, units-without-load 4.8-8.8s, positions/latest
-- 4.2s, detention/board 3.2s) → ≤2s on prod.

-- 1. Cache table
CREATE TABLE telematics.vehicle_latest_position_cache (
  id                    uuid            NOT NULL,
  operating_company_id  uuid            NOT NULL,
  unit_id               uuid            NOT NULL,
  samsara_vehicle_id    text,
  captured_at           timestamptz     NOT NULL,
  lat                   numeric,
  lng                   numeric,
  speed_mph             numeric,
  heading_deg           numeric,
  engine_state          text,
  raw_samsara_event_id  text,
  city                  text,
  state                 text,
  formatted_location    text,
  odometer_mi           double precision,
  CONSTRAINT vehicle_latest_position_cache_pkey
    PRIMARY KEY (operating_company_id, unit_id)
);

-- 2. RLS (same policy as vehicle_locations)
ALTER TABLE telematics.vehicle_latest_position_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicle_latest_position_cache_select
  ON telematics.vehicle_latest_position_cache
  FOR SELECT
  USING (
    identity.is_lucia_bypass()
    OR (operating_company_id::text = current_setting('app.operating_company_id', true))
  );

GRANT SELECT ON telematics.vehicle_latest_position_cache TO ih35_app;

-- 3. Backfill: one row per (opco, unit) — latest captured_at wins
INSERT INTO telematics.vehicle_latest_position_cache (
  id, operating_company_id, unit_id, samsara_vehicle_id,
  captured_at, lat, lng, speed_mph, heading_deg, engine_state,
  raw_samsara_event_id, city, state, formatted_location, odometer_mi
)
SELECT DISTINCT ON (operating_company_id, unit_id)
  id, operating_company_id, unit_id, samsara_vehicle_id,
  captured_at, lat, lng, speed_mph, heading_deg, engine_state,
  raw_samsara_event_id, city, state, formatted_location, odometer_mi
FROM telematics.vehicle_locations
ORDER BY operating_company_id, unit_id, captured_at DESC, created_at DESC;

-- 4. Trigger function: upsert cache on each new location row, only if newer
CREATE OR REPLACE FUNCTION telematics.upsert_vehicle_latest_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = telematics, identity, public
AS $$
BEGIN
  INSERT INTO telematics.vehicle_latest_position_cache (
    id, operating_company_id, unit_id, samsara_vehicle_id,
    captured_at, lat, lng, speed_mph, heading_deg, engine_state,
    raw_samsara_event_id, city, state, formatted_location, odometer_mi
  ) VALUES (
    NEW.id, NEW.operating_company_id, NEW.unit_id, NEW.samsara_vehicle_id,
    NEW.captured_at, NEW.lat, NEW.lng, NEW.speed_mph, NEW.heading_deg,
    NEW.engine_state, NEW.raw_samsara_event_id, NEW.city, NEW.state,
    NEW.formatted_location, NEW.odometer_mi
  )
  ON CONFLICT (operating_company_id, unit_id) DO UPDATE
    SET id                   = EXCLUDED.id,
        samsara_vehicle_id   = EXCLUDED.samsara_vehicle_id,
        captured_at          = EXCLUDED.captured_at,
        lat                  = EXCLUDED.lat,
        lng                  = EXCLUDED.lng,
        speed_mph            = EXCLUDED.speed_mph,
        heading_deg          = EXCLUDED.heading_deg,
        engine_state         = EXCLUDED.engine_state,
        raw_samsara_event_id = EXCLUDED.raw_samsara_event_id,
        city                 = EXCLUDED.city,
        state                = EXCLUDED.state,
        formatted_location   = EXCLUDED.formatted_location,
        odometer_mi          = EXCLUDED.odometer_mi
    WHERE EXCLUDED.captured_at > telematics.vehicle_latest_position_cache.captured_at;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION telematics.upsert_vehicle_latest_position() TO ih35_app;

-- 5. Trigger on vehicle_locations INSERT
CREATE TRIGGER trg_upsert_vehicle_latest_position
AFTER INSERT ON telematics.vehicle_locations
FOR EACH ROW
EXECUTE FUNCTION telematics.upsert_vehicle_latest_position();

-- 6. Replace the VIEW to read from cache (same columns, same name — no API changes needed)
DROP VIEW IF EXISTS telematics.vehicle_latest_position;

CREATE VIEW telematics.vehicle_latest_position AS
SELECT
  id,
  operating_company_id,
  unit_id,
  samsara_vehicle_id,
  captured_at,
  lat,
  lng,
  speed_mph,
  heading_deg,
  engine_state,
  raw_samsara_event_id,
  city,
  state,
  formatted_location,
  odometer_mi
FROM telematics.vehicle_latest_position_cache;

-- Grant same as before
GRANT SELECT ON telematics.vehicle_latest_position TO ih35_app;
