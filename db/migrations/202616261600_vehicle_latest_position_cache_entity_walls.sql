-- 202616261600_vehicle_latest_position_cache_entity_walls.sql
-- Cursor — LEAD 443.326 CI unblock (verify:entity-isolation + verify:orphan-fk-inventory).
--
-- Migration 202616200100 (TELE-F443262 / #27252, already on main) created
-- telematics.vehicle_latest_position_cache with ENABLE RLS + a SELECT-only policy, but without:
--   1. FOREIGN KEY (operating_company_id) → org.companies(id)
--   2. FOREIGN KEY (unit_id) → mdata.units(id)  (parity with telematics.vehicle_locations / 0233)
--   3. FORCE ROW LEVEL SECURITY (owner could bypass the SELECT policy)
--   4. INSERT/UPDATE policies (FORCE would lock the SECURITY DEFINER upsert trigger)
--
-- CREATE-only / idempotent. Constraints added NOT VALID then VALIDATEd (SHARE UPDATE EXCLUSIVE).
-- Cache rows are a projection of vehicle_locations (which already FKs both parents) — orphans impossible
-- if vehicle_locations stayed consistent; VALIDATE still runs so a fresh CI DB proves it.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

-- 1. Write policies so FORCE RLS does not break the AFTER INSERT upsert trigger
--    (samsara writers already set lucia bypass + app.operating_company_id in-session).
DO $$
BEGIN
  IF to_regclass('telematics.vehicle_latest_position_cache') IS NULL THEN
    RAISE NOTICE '202616261600: telematics.vehicle_latest_position_cache absent — skipped';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS vehicle_latest_position_cache_select
    ON telematics.vehicle_latest_position_cache;
  DROP POLICY IF EXISTS vehicle_latest_position_cache_all
    ON telematics.vehicle_latest_position_cache;

  CREATE POLICY vehicle_latest_position_cache_all
    ON telematics.vehicle_latest_position_cache
    FOR ALL
    USING (
      identity.is_lucia_bypass()
      OR (operating_company_id::text = current_setting('app.operating_company_id', true))
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR (operating_company_id::text = current_setting('app.operating_company_id', true))
    );

  GRANT SELECT, INSERT, UPDATE ON telematics.vehicle_latest_position_cache TO ih35_app;
  REVOKE DELETE ON telematics.vehicle_latest_position_cache FROM ih35_app;
END
$$;

-- 2. Trigger function: set lucia bypass so FORCE RLS never blocks the cache upsert even if a
--    future writer forgets the GUC (belt-and-suspenders; session GUCs still apply to callers).
CREATE OR REPLACE FUNCTION telematics.upsert_vehicle_latest_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = telematics, identity, public
AS $$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
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

-- 3. Entity walls: opco FK + unit FK + FORCE RLS
DO $$
BEGIN
  IF to_regclass('telematics.vehicle_latest_position_cache') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.conrelid = 'telematics.vehicle_latest_position_cache'::regclass
       AND con.contype = 'f'
       AND con.confrelid = 'org.companies'::regclass
       AND a.attname = 'operating_company_id'
  ) THEN
    ALTER TABLE telematics.vehicle_latest_position_cache
      ADD CONSTRAINT telematics_vehicle_latest_position_cache_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) NOT VALID;
    ALTER TABLE telematics.vehicle_latest_position_cache
      VALIDATE CONSTRAINT telematics_vehicle_latest_position_cache_operating_company_id_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.conrelid = 'telematics.vehicle_latest_position_cache'::regclass
       AND con.contype = 'f'
       AND con.confrelid = 'mdata.units'::regclass
       AND a.attname = 'unit_id'
  ) THEN
    ALTER TABLE telematics.vehicle_latest_position_cache
      ADD CONSTRAINT telematics_vehicle_latest_position_cache_unit_id_fkey
      FOREIGN KEY (unit_id) REFERENCES mdata.units(id) NOT VALID;
    ALTER TABLE telematics.vehicle_latest_position_cache
      VALIDATE CONSTRAINT telematics_vehicle_latest_position_cache_unit_id_fkey;
  END IF;

  ALTER TABLE telematics.vehicle_latest_position_cache ENABLE ROW LEVEL SECURITY;
  ALTER TABLE telematics.vehicle_latest_position_cache FORCE ROW LEVEL SECURITY;
END
$$;

-- 4. Post-conditions (fail CI loud if walls did not land)
DO $$
DECLARE
  v_forced boolean;
  v_opco_fk boolean;
  v_unit_fk boolean;
BEGIN
  IF to_regclass('telematics.vehicle_latest_position_cache') IS NULL THEN
    RETURN;
  END IF;

  SELECT relforcerowsecurity INTO v_forced
    FROM pg_class WHERE oid = 'telematics.vehicle_latest_position_cache'::regclass;
  IF v_forced IS NOT TRUE THEN
    RAISE EXCEPTION '202616261600: FORCE ROW LEVEL SECURITY missing on telematics.vehicle_latest_position_cache';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.conrelid = 'telematics.vehicle_latest_position_cache'::regclass
       AND con.contype = 'f'
       AND con.confrelid = 'org.companies'::regclass
       AND a.attname = 'operating_company_id'
  ) INTO v_opco_fk;
  IF v_opco_fk IS NOT TRUE THEN
    RAISE EXCEPTION '202616261600: operating_company_id FK to org.companies missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
     WHERE con.conrelid = 'telematics.vehicle_latest_position_cache'::regclass
       AND con.contype = 'f'
       AND con.confrelid = 'mdata.units'::regclass
       AND a.attname = 'unit_id'
  ) INTO v_unit_fk;
  IF v_unit_fk IS NOT TRUE THEN
    RAISE EXCEPTION '202616261600: unit_id FK to mdata.units missing';
  END IF;
END
$$;

COMMIT;
