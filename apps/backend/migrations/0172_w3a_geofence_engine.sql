-- W3A-GEOFENCE-ENGINE: schema, tables, RLS, indexes, spine logging
-- Extends GAP-54/55/56 groundwork. Does NOT duplicate samsara_positions_cron.
-- Writes geofence enter/exit events to events.event_log via log_event().

BEGIN;

CREATE SCHEMA IF NOT EXISTS geofence;

-- ─── FENCE ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofence.fence (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  name                  text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  center_lat            numeric(10,7) NOT NULL,
  center_lng            numeric(10,7) NOT NULL,
  radius_meters         integer NOT NULL CHECK (radius_meters BETWEEN 50 AND 50000),
  fence_type            text NOT NULL DEFAULT 'custom'
                          CHECK (fence_type IN ('yard','customer','custom','border_crossing')),
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  soft_deleted_at       timestamptz
);

ALTER TABLE geofence.fence ENABLE ROW LEVEL SECURITY;

CREATE POLICY geofence_fence_tenant ON geofence.fence
  USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_geofence_fence_company_active
  ON geofence.fence (operating_company_id, is_active)
  WHERE soft_deleted_at IS NULL;

-- ─── EVENT ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofence.event (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  fence_id              uuid NOT NULL REFERENCES geofence.fence(id),
  unit_id               uuid NOT NULL,
  load_id               uuid,
  event_type            text NOT NULL CHECK (event_type IN ('enter','exit','dwell_exceeded','left_yard_without_load')),
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  lat                   numeric(10,7),
  lng                   numeric(10,7),
  dwell_seconds         integer,
  spine_event_id        uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE geofence.event ENABLE ROW LEVEL SECURITY;

CREATE POLICY geofence_event_tenant ON geofence.event
  USING (operating_company_id = current_setting('app.operating_company_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_geofence_event_fence_occurred
  ON geofence.event (fence_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_geofence_event_unit_occurred
  ON geofence.event (operating_company_id, unit_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_geofence_event_load
  ON geofence.event (load_id)
  WHERE load_id IS NOT NULL;

-- ─── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geofence.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_geofence_fence_updated_at ON geofence.fence;
CREATE TRIGGER trg_geofence_fence_updated_at
  BEFORE UPDATE ON geofence.fence
  FOR EACH ROW EXECUTE FUNCTION geofence.set_updated_at();

-- ─── spine logging trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION geofence.log_event_to_spine()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM events.log_event(
      NEW.operating_company_id::text,
      'geofence.' || NEW.event_type,
      'system',
      NULL,
      'unit',
      NEW.unit_id::text,
      jsonb_build_object(
        'fence_id', NEW.fence_id,
        'load_id',  NEW.load_id,
        'lat',      NEW.lat,
        'lng',      NEW.lng,
        'dwell_seconds', NEW.dwell_seconds
      ),
      NEW.occurred_at,
      'W3A-GEOFENCE-ENGINE'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- spine unavailable; event still persists
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_geofence_event_spine ON geofence.event;
CREATE TRIGGER trg_geofence_event_spine
  AFTER INSERT ON geofence.event
  FOR EACH ROW EXECUTE FUNCTION geofence.log_event_to_spine();

-- ─── grants ───────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA geofence TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA geofence TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA geofence TO ih35_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA geofence TO ih35_app;

COMMIT;
