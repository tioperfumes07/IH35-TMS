-- 202613761200 — GEOFENCE ENGINE REBUILD migration #4 (09-05-2026-Claude-Coder-3-GEOFENCE-ENGINE-REBUILD spec §2).
-- Applied by Cursor under lead C.3 (CC-1 missed M.1 03:40Z; single-author migration, Cursor).
-- Source: docs/audit/migration-drafts/GEOFENCE-ENGINE-REBUILD-migration-4-draft.sql (CC-3, no-migrations lane).
-- Idempotent throughout (CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP CONSTRAINT|POLICY IF EXISTS
-- for re-creatable objects only). Nothing dropped or renamed — void-not-delete / append-only law.
-- FORCED RLS + 0065 grants on every new table.
-- WHY (owner packet, verbatim): geofence state today lives on the shared geo.geofences row
-- (current_state/state_updated_at) -- 16 trucks fighting over ONE column per geofence, which is
-- DEFECT A ("the flap"): thousands of garbage transition rows from vehicles overwriting each
-- other's state. DEFECT B: geo.geofences.current_state got stuck in 'departed' with no outgoing
-- edge (code-only fix, already shipped in states.ts/engine.ts in this same PR) -- this migration
-- gives the corrected engine somewhere real to write per-vehicle state once applied.
--
-- The application code (states.ts / engine.ts / transitions.service.ts, this same PR) already
-- degrades gracefully via to_regclass('geo.geofence_vehicle_state') and REFUSES to write (logs a
-- warning, returns {skipped:true}) rather than falling back to the old shared-column flap -- so
-- this migration can land on CC-1's own schedule with zero code coordination required. The engine
-- is correct the moment this table exists.

BEGIN;

-- ============================================================================
-- §2.1 -- Move per-vehicle geofence state off geo.geofences onto the (geofence, vehicle) pair.
-- ============================================================================
CREATE TABLE IF NOT EXISTS geo.geofence_vehicle_state (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  geofence_id            uuid NOT NULL REFERENCES geo.geofences(id),
  unit_id                uuid NOT NULL REFERENCES mdata.units(id),
  current_state          text NOT NULL DEFAULT 'idle'
    CHECK (current_state IN ('idle','approaching','at','dwelling','departing','departed')),
  state_updated_at       timestamptz NOT NULL DEFAULT now(),
  distance_m             numeric,
  entered_at             timestamptz,
  dwell_started_at       timestamptz,
  departed_at            timestamptz,
  odometer_at_entry_mi   double precision,
  odometer_at_exit_mi    double precision,
  load_id                uuid REFERENCES mdata.loads(id),
  stop_id                uuid REFERENCES mdata.load_stops(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_geofence_vehicle_state_pair UNIQUE (operating_company_id, geofence_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_geofence_vehicle_state_company
  ON geo.geofence_vehicle_state (operating_company_id, geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_vehicle_state_unit
  ON geo.geofence_vehicle_state (operating_company_id, unit_id);

-- FORCED RLS + grants, the 0065 pattern (same shape as integrations.samsara_addresses).
ALTER TABLE geo.geofence_vehicle_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo.geofence_vehicle_state FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geofence_vehicle_state_entity_select ON geo.geofence_vehicle_state;
DROP POLICY IF EXISTS geofence_vehicle_state_entity_write ON geo.geofence_vehicle_state;
CREATE POLICY geofence_vehicle_state_entity_select ON geo.geofence_vehicle_state FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
CREATE POLICY geofence_vehicle_state_entity_write ON geo.geofence_vehicle_state FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
GRANT SELECT, INSERT, UPDATE ON geo.geofence_vehicle_state TO ih35_app;
-- No DELETE grant -- void-not-delete; there is nothing to void here, a row is simply superseded
-- by its own updated current_state, so no deactivated_at column is needed on this table.

-- geo.geofences.current_state / state_updated_at are RETAINED but become READ-ONLY legacy
-- (append-only law -- do not drop). Application code stops writing them as of this same PR.
COMMENT ON COLUMN geo.geofences.current_state IS
  'DEPRECATED 2026-09-05 -- per-vehicle state lives in geo.geofence_vehicle_state';
COMMENT ON COLUMN geo.geofences.state_updated_at IS
  'DEPRECATED 2026-09-05 -- per-vehicle state lives in geo.geofence_vehicle_state';

-- ============================================================================
-- §2.2 -- Widen the geofence catalog for fuel stops, cities and imports.
-- ============================================================================
ALTER TABLE geo.geofences DROP CONSTRAINT IF EXISTS geo_geofences_location_kind_check;
ALTER TABLE geo.geofences ADD CONSTRAINT geo_geofences_location_kind_check
  CHECK (location_kind IN ('customer_site','yard','vendor_site','custom',
                           'dot_inspection_station','fuel_stop','city_zone','border_crossing'));

ALTER TABLE geo.geofences DROP CONSTRAINT IF EXISTS geo_geofences_source_check;
ALTER TABLE geo.geofences ADD CONSTRAINT geo_geofences_source_check
  CHECK (source IN ('manual','auto_dispatch','samsara_import','loves_import','city_import'));

ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS center_lat numeric;
ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS center_lng numeric;
ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS radius_m integer;
ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS approach_radius_m integer;
ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS external_source text;
ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS external_ref text;
ALTER TABLE geo.geofences ADD COLUMN IF NOT EXISTS requires_driver_response boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS geo_geofences_external_uq
  ON geo.geofences (operating_company_id, external_source, external_ref)
  WHERE external_ref IS NOT NULL;

-- Bounding-box prefilter index (§3.3 of the engine rebuild -- processGpsBatch is O(geofences x
-- vehicles) today across 604+ Loves fences without it).
CREATE INDEX IF NOT EXISTS idx_geofences_center
  ON geo.geofences (operating_company_id, center_lat, center_lng)
  WHERE is_active = true;

-- ============================================================================
-- §2.3 -- Driver prompt / answer -- "he has to answer in the app" requirement.
-- pwa.driver_notifications is fire-and-forget; it cannot represent a question with an answer.
-- ============================================================================
CREATE TABLE IF NOT EXISTS pwa.driver_prompts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  driver_id              uuid NOT NULL REFERENCES mdata.drivers(id),
  unit_id                uuid REFERENCES mdata.units(id),
  load_id                uuid REFERENCES mdata.loads(id),
  stop_id                uuid REFERENCES mdata.load_stops(id),
  geofence_id            uuid REFERENCES geo.geofences(id),
  prompt_kind            text NOT NULL
    CHECK (prompt_kind IN ('approaching_city','arrived_geofence','arrived_stop',
                           'departing_unreported','departed_city','fuel_stop_arrival')),
  question               text NOT NULL,
  options_json           jsonb NOT NULL,
  asked_at               timestamptz NOT NULL DEFAULT now(),
  expires_at             timestamptz,
  answered_at            timestamptz,
  answer_code            text,
  answer_note            text,
  answered_by_user_uuid  uuid REFERENCES identity.users(id),
  escalation_count       integer NOT NULL DEFAULT 0,
  last_escalated_at      timestamptz,
  resolved_by            text CHECK (resolved_by IN ('driver','dispatcher','auto_movement','auto_expiry')),
  gps_lat                numeric,
  gps_lng                numeric,
  odometer_mi            double precision,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pwa_driver_prompts_open_idx
  ON pwa.driver_prompts (operating_company_id, driver_id)
  WHERE answered_at IS NULL;

ALTER TABLE pwa.driver_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pwa.driver_prompts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_prompts_entity_select ON pwa.driver_prompts;
DROP POLICY IF EXISTS driver_prompts_entity_write ON pwa.driver_prompts;
CREATE POLICY driver_prompts_entity_select ON pwa.driver_prompts FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
CREATE POLICY driver_prompts_entity_write ON pwa.driver_prompts FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
GRANT SELECT, INSERT, UPDATE ON pwa.driver_prompts TO ih35_app;
-- No DELETE grant -- "a prompt is never deleted" (spec §2.3); unanswered + truck moved is
-- recorded as resolved_by='auto_movement', never a row removal.

-- ============================================================================
-- §2.4 -- Odometer-based real driven miles per load.
-- telematics.vehicle_locations / vehicle_latest_position already carry odometer_mi
-- (643,527 rows back to 2019 across 82 units) -- this is the only odometer source used.
-- ============================================================================
CREATE TABLE IF NOT EXISTS telematics.load_odometer_segments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),
  load_id                uuid NOT NULL REFERENCES mdata.loads(id),
  unit_id                uuid NOT NULL REFERENCES mdata.units(id),
  segment_kind           text NOT NULL CHECK (segment_kind IN ('deadhead_to_pickup','loaded','empty_home','fuel_detour')),
  from_stop_id           uuid REFERENCES mdata.load_stops(id),
  to_stop_id             uuid REFERENCES mdata.load_stops(id),
  started_at             timestamptz NOT NULL,
  ended_at               timestamptz,
  odometer_start_mi      double precision,
  odometer_end_mi        double precision,
  driven_miles           numeric GENERATED ALWAYS AS (odometer_end_mi - odometer_start_mi) STORED,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_load_odometer_segments UNIQUE (operating_company_id, load_id, unit_id, segment_kind, started_at)
);

ALTER TABLE telematics.load_odometer_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE telematics.load_odometer_segments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS load_odometer_segments_entity_select ON telematics.load_odometer_segments;
DROP POLICY IF EXISTS load_odometer_segments_entity_write ON telematics.load_odometer_segments;
CREATE POLICY load_odometer_segments_entity_select ON telematics.load_odometer_segments FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
CREATE POLICY load_odometer_segments_entity_write ON telematics.load_odometer_segments FOR ALL
  USING (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id IN (SELECT org.user_accessible_company_ids()));
GRANT SELECT, INSERT, UPDATE ON telematics.load_odometer_segments TO ih35_app;

-- ============================================================================
-- §3.5 -- One-time cleanup markers for the 6,253 garbage flap-transition rows.
-- Do NOT delete them (append-only law). Mark, don't erase -- every report/view over this table
-- must filter WHERE is_superseded = false going forward (application-side, this same PR's
-- listTransitions() is unaffected since it is a raw audit read, not a report).
-- ============================================================================
ALTER TABLE geo.geofence_state_transitions ADD COLUMN IF NOT EXISTS is_superseded boolean NOT NULL DEFAULT false;
ALTER TABLE geo.geofence_state_transitions ADD COLUMN IF NOT EXISTS superseded_reason text;

-- Mark the pre-2026-09-05 flap rows on the one geofence proven live to have the defect. Real id
-- confirmed live 2026-09-05 (geo.geofences has exactly 2 rows total in the whole DB):
--   188cf90c-d970-4ab0-9795-d23394b38af1 -- "Home base — 23918 Mines Rd, Laredo, TX 78045",
--   current_state='departed' at draft time -- the exact dead-locked row this whole PR fixes.
-- Idempotent (re-running only re-marks the same already-true rows). Scoped by geofence_id + a
-- cutoff timestamp, never a blanket UPDATE -- every other geofence's rows are left untouched.
UPDATE geo.geofence_state_transitions
SET is_superseded = true,
    superseded_reason = 'shared-current_state race, GAP-39 defect, corrected 2026-09-05'
WHERE geofence_id = '188cf90c-d970-4ab0-9795-d23394b38af1'::uuid
  AND transitioned_at < '2026-09-05 00:00:00+00'::timestamptz
  AND is_superseded = false;

COMMIT;
