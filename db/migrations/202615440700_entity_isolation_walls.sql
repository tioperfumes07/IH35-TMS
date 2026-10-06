-- 202615440700_entity_isolation_walls.sql
-- CC-2 — ACCT-F2026100624: close the entity-isolation gaps verify:entity-isolation reports on every fresh build.
--
-- Total entity isolation (owner, 2026-07-05): "each company should never touch anything of another." A business table is
-- walled when its company column has a foreign key to org.companies, an opco-scoped RLS policy, and FORCE ROW LEVEL
-- SECURITY. Measured on production 2026-10-06 (read-only, with the sanctioned bypass so FORCE RLS could not hide rows):
--
--   1. FK operating_company_id -> org.companies(id) was missing on seven tables that already carry the column, an
--      opco-scoped policy and (except two) FORCE: audit.record_deletions (36,294 rows), fuel.load_fuel_cost (0),
--      fuel.tank_events (1), fuel.tank_state (0), fuel.unit_mpg (21), telematics.odometer_readings (52,567),
--      telematics.unit_stop_events (461). 0 NULL and 0 orphan company ids in every one — the constraints validate.
--   2. FORCE ROW LEVEL SECURITY was off on telematics.geofence_odometer_captures, telematics.odometer_readings and
--      telematics.unit_stop_events (RLS on, so the table OWNER bypassed every policy). Writer audit: every live writer
--      already runs as ih35_app inside withLuciaBypass (SET LOCAL app.bypass_rls = 'lucia' — the odometer snapshot,
--      unit-stop-events and geofence-odometer-capture crons) or withCurrentUser / withCompanyScope with
--      app.operating_company_id set (manual odometer and service-history backfill routes); each table's policy admits
--      both. Guards read as ih35_guard_reader (BYPASSRLS). FORCE therefore changes nothing for any live path; it closes
--      the owner hole.
--   3. The ten preserve.* tables (the telematics / geocode preservation copy, 202615220900) are deliberately keyed by
--      NATURAL keys so they survive a reset of every UUID: company_code text, not operating_company_id. They already
--      carry FORCE RLS and a per-company policy (company_code = the code of current_setting('app.operating_company_id')).
--      What they lacked is referential integrity on that key: company_code -> org.companies(code) (UNIQUE
--      companies_code_key). 0 NULL and 0 unknown codes across 1.65M rows. The natural key stays — the FK makes a row for
--      a company that does not exist impossible, exactly what the uuid FK does elsewhere.
--
-- Constraints are added NOT VALID then VALIDATEd (VALIDATE takes SHARE UPDATE EXCLUSIVE — reads and writes continue).
-- Idempotent: every step checks the catalog first. No data moves.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

-- 1. operating_company_id -> org.companies(id)
DO $$
DECLARE
  t text;
  r record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit.record_deletions',
    'fuel.load_fuel_cost',
    'fuel.tank_events',
    'fuel.tank_state',
    'fuel.unit_mpg',
    'telematics.odometer_readings',
    'telematics.unit_stop_events'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE '202615440700: % absent — skipped', t;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
       WHERE con.conrelid = t::regclass AND con.contype = 'f'
         AND con.confrelid = 'org.companies'::regclass AND a.attname = 'operating_company_id'
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (operating_company_id) REFERENCES org.companies(id) NOT VALID',
      t, replace(t, '.', '_') || '_operating_company_id_fkey'
    );
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', t, replace(t, '.', '_') || '_operating_company_id_fkey');
  END LOOP;
END
$$;

-- 2. FORCE ROW LEVEL SECURITY on the three telematics tables (policies unchanged)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'telematics.geofence_odometer_captures',
    'telematics.odometer_readings',
    'telematics.unit_stop_events'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE '202615440700: % absent — skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- 3. preserve.* natural-key wall: company_code -> org.companies(code)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'preserve.dvir_submissions',
    'preserve.geofence_events',
    'preserve.geofences',
    'preserve.hos_snapshots',
    'preserve.load_odometer_segments',
    'preserve.odometer_readings',
    'preserve.route_stop_progress',
    'preserve.samsara_addresses',
    'preserve.unit_stop_events',
    'preserve.vehicle_positions'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE '202615440700: % absent — skipped', t;
      CONTINUE;
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
       WHERE con.conrelid = t::regclass AND con.contype = 'f'
         AND con.confrelid = 'org.companies'::regclass AND a.attname = 'company_code'
    ) THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (company_code) REFERENCES org.companies(code) NOT VALID',
      t, replace(t, '.', '_') || '_company_code_fkey'
    );
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', t, replace(t, '.', '_') || '_company_code_fkey');
  END LOOP;
END
$$;

COMMIT;
