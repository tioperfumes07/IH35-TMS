BEGIN;

-- CAP-13 (Phase 5 Telematics): tenant-scoped polygon geofencing + append-only entry/exit events.
CREATE SCHEMA IF NOT EXISTS geo;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS geo.geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  label text NOT NULL CHECK (char_length(trim(label)) > 0),
  location_kind text NOT NULL CHECK (location_kind IN ('customer_site', 'yard', 'vendor_site', 'custom')),
  location_ref_id uuid NULL,
  polygon geography(POLYGON, 4326) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_uuid uuid NULL REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_uuid uuid NULL REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS ix_geo_geofences_company_active
  ON geo.geofences (operating_company_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_geo_geofences_polygon_gist
  ON geo.geofences
  USING GIST (polygon);

CREATE TABLE IF NOT EXISTS geo.geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  geofence_id uuid NOT NULL REFERENCES geo.geofences(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  event_kind text NOT NULL CHECK (event_kind IN ('entered', 'exited')),
  occurred_at timestamptz NOT NULL,
  raw_gps_point geography(POINT, 4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'samsara_gps' CHECK (source IN ('samsara_gps', 'manual'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_geo_geofence_events_dedupe
  ON geo.geofence_events (operating_company_id, geofence_id, unit_id, event_kind, occurred_at, source);

CREATE INDEX IF NOT EXISTS ix_geo_geofence_events_company_lookup
  ON geo.geofence_events (operating_company_id, geofence_id, unit_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_geo_geofence_events_point_gist
  ON geo.geofence_events
  USING GIST (raw_gps_point);

CREATE OR REPLACE FUNCTION geo.touch_geofence_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_geo_geofences_touch_updated_at ON geo.geofences;
CREATE TRIGGER trg_geo_geofences_touch_updated_at
BEFORE UPDATE ON geo.geofences
FOR EACH ROW
EXECUTE FUNCTION geo.touch_geofence_updated_at();

CREATE OR REPLACE FUNCTION geo.block_geofence_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'geo.geofence_events is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_geo_geofence_events_block_update ON geo.geofence_events;
CREATE TRIGGER trg_geo_geofence_events_block_update
BEFORE UPDATE ON geo.geofence_events
FOR EACH ROW
EXECUTE FUNCTION geo.block_geofence_events_mutation();

DROP TRIGGER IF EXISTS trg_geo_geofence_events_block_delete ON geo.geofence_events;
CREATE TRIGGER trg_geo_geofence_events_block_delete
BEFORE DELETE ON geo.geofence_events
FOR EACH ROW
EXECUTE FUNCTION geo.block_geofence_events_mutation();

ALTER TABLE geo.geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.geofence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_geo_geofences_company ON geo.geofences;
CREATE POLICY rls_geo_geofences_company
ON geo.geofences
FOR ALL TO ih35_app
USING (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
)
WITH CHECK (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
);

DROP POLICY IF EXISTS rls_geo_geofence_events_company ON geo.geofence_events;
CREATE POLICY rls_geo_geofence_events_company
ON geo.geofence_events
FOR ALL TO ih35_app
USING (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
)
WITH CHECK (
  operating_company_id = current_setting('app.operating_company_id', true)::uuid
  OR current_setting('app.bypass_rls', true) = 'lucia'
);

REVOKE UPDATE, DELETE ON geo.geofence_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON geo.geofence_events FROM ih35_app;

GRANT USAGE ON SCHEMA geo TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON geo.geofences TO ih35_app;
GRANT SELECT, INSERT ON geo.geofence_events TO ih35_app;

COMMIT;
