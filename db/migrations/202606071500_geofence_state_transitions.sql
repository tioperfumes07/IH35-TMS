-- GAP-39: Geofence state machine — formal transitions (Blueprint §3.16, G17)
BEGIN;

CREATE TABLE IF NOT EXISTS geo.geofence_state_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  geofence_id uuid NOT NULL REFERENCES geo.geofences(id),
  vehicle_id uuid NOT NULL REFERENCES mdata.units(id),
  load_id uuid NULL REFERENCES mdata.loads(id),
  stop_id uuid NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  transitioned_at timestamptz NOT NULL,
  trigger_source text NOT NULL CHECK (trigger_source IN ('gps_event', 'manual', 'timeout', 'recompute')),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_gst_vehicle_time
  ON geo.geofence_state_transitions (vehicle_id, transitioned_at DESC);

CREATE INDEX IF NOT EXISTS idx_geo_gst_load
  ON geo.geofence_state_transitions (load_id)
  WHERE load_id IS NOT NULL;

ALTER TABLE geo.geofences
  ADD COLUMN IF NOT EXISTS current_state text CHECK (
    current_state IN ('idle', 'approaching', 'at', 'dwelling', 'departing', 'departed')
  ) DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS state_updated_at timestamptz;

ALTER TABLE geo.geofence_state_transitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_geo_gst_company ON geo.geofence_state_transitions;
CREATE POLICY rls_geo_gst_company
  ON geo.geofence_state_transitions
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON geo.geofence_state_transitions TO ih35_app;

COMMIT;
