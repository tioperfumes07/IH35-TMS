-- 202615181000_samsara_route_progress.sql
-- ROUND 313 E-31 (claim #23843). The routes push now succeeds (first live route: load 13639 -> Samsara route
-- 4446734085), but the Samsara route id lived only in the integration_sync_log payload and nothing read the route
-- back. Two additive pieces:
--   1. mdata.loads.samsara_route_id -- the route id stamped on the load (forward link load -> Samsara route;
--      the route carries externalIds.ih35Load for the reverse).
--   2. integrations.samsara_route_stop_progress -- one row per load stop: Samsara's stop state, ETA, actual
--      arrival / departure and live-share URL, read back by the E-31 poller. Linked to load, stop, unit;
--      entity-scoped with FORCED RLS. Read-back evidence only -- the canonical arrival stays geo.geofence_events.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE mdata.loads ADD COLUMN IF NOT EXISTS samsara_route_id text NULL;
COMMENT ON COLUMN mdata.loads.samsara_route_id IS
  'E-31: the Samsara route this load was pushed as (routes-integration.service). Reverse: route externalIds.ih35Load.';

CREATE TABLE IF NOT EXISTS integrations.samsara_route_stop_progress (
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  stop_id uuid NOT NULL REFERENCES mdata.load_stops(id),
  unit_id uuid NULL REFERENCES mdata.units(id),
  samsara_route_id text NOT NULL,
  samsara_stop_id text NOT NULL,
  sequence_number integer NOT NULL,
  state text NULL,
  eta timestamptz NULL,
  actual_arrival_at timestamptz NULL,
  actual_departure_at timestamptz NULL,
  en_route_at timestamptz NULL,
  skipped_at timestamptz NULL,
  planned_distance_meters numeric NULL,
  live_sharing_url text NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (load_id, stop_id)
);
CREATE INDEX IF NOT EXISTS samsara_route_stop_progress_company_read_idx
  ON integrations.samsara_route_stop_progress (operating_company_id, read_at DESC);
CREATE INDEX IF NOT EXISTS samsara_route_stop_progress_unit_idx
  ON integrations.samsara_route_stop_progress (unit_id);

ALTER TABLE integrations.samsara_route_stop_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.samsara_route_stop_progress FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS samsara_route_stop_progress_company_isolation ON integrations.samsara_route_stop_progress;
CREATE POLICY samsara_route_stop_progress_company_isolation ON integrations.samsara_route_stop_progress
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE ON integrations.samsara_route_stop_progress TO ih35_app;

COMMENT ON TABLE integrations.samsara_route_stop_progress IS
  'E-31 read-back: Samsara route stop state / ETA / actuals per load stop. Evidence only; arrivals of record are geo.geofence_events.';

COMMIT;
