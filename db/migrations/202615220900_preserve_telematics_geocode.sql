-- 202615220900_preserve_telematics_geocode.sql -- CC-3 queue item 11 (claim #23990).
-- THE TELEMATICS + GEOCODE PRESERVATION LEDGER. What a truck reported at a moment in time cannot be re-fed: Samsara's
-- retention window closes. Before any purge, every observed fact is copied here and kept.
--
-- Rules (Lead order, item 11):
--   * NATURAL KEYS ONLY — unit number (T152), load number (13639), driver name + CDL, UTC timestamp, odometer,
--     latitude / longitude and the address as geocoded at the time. Never a UUID as a join key: UUIDs die with the purge.
--   * The old UUIDs ride along in pre_reset jsonb, marked dead reference ("pre_reset": true) — never joined.
--   * NO FOREIGN KEY to loads, invoices, settlements or anything purgeable — a purge cannot cascade into this schema.
--   * Append-only (WORM): UPDATE and DELETE are refused for every role, including the owner role.
-- The copy engine is apps/backend/src/telematics/preservation.service.ts (cron + on demand); the owner's .xlsx is
-- scripts/ops/preserve-export-xlsx.mts.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS preserve;
COMMENT ON SCHEMA preserve IS
  'Item 11: append-only telematics + geocode ledger keyed by natural keys only; no FK to any purgeable table; never purged.';

CREATE TABLE IF NOT EXISTS preserve.vehicle_positions (
  company_code text NOT NULL, unit_number text NOT NULL, captured_at timestamptz NOT NULL,
  lat numeric NULL, lng numeric NULL, speed_mph numeric NULL, heading_deg numeric NULL, engine_state text NULL,
  odometer_mi double precision NULL, city text NULL, state text NULL, formatted_location text NULL,
  samsara_vehicle_id text NULL,
  -- Samsara's own identity for the observation (cron:locations:<vehicle>:<time> / cron:stats:... / webhook id): the
  -- poller records a location fix and a stats fix (with odometer) for the same second as two partial observations.
  observation_id text NOT NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, unit_number, captured_at, observation_id));

CREATE TABLE IF NOT EXISTS preserve.geofences (
  company_code text NOT NULL, fence_key text NOT NULL, label text NULL, location_kind text NULL,
  center_lat numeric NULL, center_lng numeric NULL, radius_m integer NULL, vertices_json jsonb NULL,
  samsara_address_id text NULL, formatted_address text NULL, source text NULL, first_seen_at timestamptz NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, fence_key));

CREATE TABLE IF NOT EXISTS preserve.geofence_events (
  company_code text NOT NULL, unit_number text NOT NULL, fence_key text NOT NULL, event_kind text NOT NULL,
  occurred_at timestamptz NOT NULL, point_lat numeric NULL, point_lng numeric NULL, fence_label text NULL,
  driver_name text NULL, driver_cdl text NULL, odometer_mi double precision NULL, odometer_source text NULL, source text NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, unit_number, fence_key, event_kind, occurred_at));

CREATE TABLE IF NOT EXISTS preserve.unit_stop_events (
  company_code text NOT NULL, unit_number text NOT NULL, started_at timestamptz NOT NULL, ended_at timestamptz NULL,
  dwell_minutes numeric NULL, lat numeric NULL, lng numeric NULL, city text NULL, state text NULL,
  odometer_mi double precision NULL, odometer_read_at timestamptz NULL, miles_since_previous_stop numeric NULL,
  fence_label text NULL, fence_kind text NULL, driver_name text NULL, driver_cdl text NULL, load_number text NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, unit_number, started_at));

CREATE TABLE IF NOT EXISTS preserve.odometer_readings (
  company_code text NOT NULL, unit_number text NOT NULL, read_at timestamptz NOT NULL, source text NOT NULL,
  odometer_mi double precision NULL, confidence text NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, unit_number, read_at, source));

CREATE TABLE IF NOT EXISTS preserve.load_odometer_segments (
  company_code text NOT NULL, load_number text NOT NULL, unit_number text NULL, segment_kind text NOT NULL,
  started_at timestamptz NOT NULL, ended_at timestamptz NULL, odometer_start_mi double precision NULL,
  odometer_end_mi double precision NULL, driven_miles numeric NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, load_number, segment_kind, started_at));

CREATE TABLE IF NOT EXISTS preserve.samsara_addresses (
  company_code text NOT NULL, samsara_address_id text NOT NULL, name text NULL, formatted_address text NULL,
  lat double precision NULL, lng double precision NULL, geofence_json jsonb NULL, tags jsonb NULL, notes text NULL,
  synced_at timestamptz NULL, pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, samsara_address_id));

CREATE TABLE IF NOT EXISTS preserve.route_stop_progress (
  company_code text NOT NULL, load_number text NOT NULL, sequence_number integer NOT NULL, unit_number text NULL,
  samsara_route_id text NULL, samsara_stop_id text NULL, state text NULL, eta timestamptz NULL,
  actual_arrival_at timestamptz NULL, actual_departure_at timestamptz NULL, stop_city text NULL, stop_state text NULL,
  read_at timestamptz NULL, pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, load_number, sequence_number));

CREATE TABLE IF NOT EXISTS preserve.dvir_submissions (
  company_code text NOT NULL, unit_number text NOT NULL, submitted_at timestamptz NOT NULL, dvir_type text NOT NULL,
  trailer_number text NULL, driver_name text NULL, driver_cdl text NULL, load_number text NULL, odometer numeric NULL,
  location text NULL, geo_lat numeric NULL, geo_lng numeric NULL, items jsonb NULL, has_major_defect boolean NULL,
  has_any_defect boolean NULL, certified boolean NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, unit_number, submitted_at, dvir_type));

CREATE TABLE IF NOT EXISTS preserve.hos_snapshots (
  company_code text NOT NULL, driver_key text NOT NULL, polled_at timestamptz NOT NULL, driver_name text NULL,
  driver_cdl text NULL, unit_number text NULL, duty_status text NULL, driving_hours_remaining numeric NULL,
  on_duty_hours_remaining numeric NULL, cycle_hours_remaining numeric NULL, time_to_next_break_minutes integer NULL,
  samsara_event_at timestamptz NULL,
  -- content hash of the Samsara payload: the same driver + poll second can carry two different clock readings.
  payload_hash text NOT NULL,
  pre_reset jsonb NOT NULL DEFAULT '{}'::jsonb, preserved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_code, driver_key, polled_at, payload_hash));

-- WORM: append-only for every role.
CREATE OR REPLACE FUNCTION preserve.refuse_change() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'preserve.% is append-only: % is refused (item 11 preservation ledger; nothing here is ever changed or purged)',
    TG_TABLE_NAME, TG_OP USING ERRCODE = 'restrict_violation';
END $fn$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['vehicle_positions','geofences','geofence_events','unit_stop_events','odometer_readings',
                           'load_odometer_segments','samsara_addresses','route_stop_progress','dvir_submissions','hos_snapshots'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON preserve.%I', t || '_worm', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON preserve.%I FOR EACH ROW EXECUTE FUNCTION preserve.refuse_change()', t || '_worm', t);
    EXECUTE format('ALTER TABLE preserve.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE preserve.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON preserve.%I', t || '_company', t);
    EXECUTE format($p$CREATE POLICY %I ON preserve.%I
      USING (identity.is_lucia_bypass() OR company_code = (SELECT c.code FROM org.companies c
               WHERE c.id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid))
      WITH CHECK (identity.is_lucia_bypass() OR company_code = (SELECT c.code FROM org.companies c
               WHERE c.id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid))$p$, t || '_company', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON preserve.%I', t || '_worm_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON preserve.%I FOR EACH STATEMENT EXECUTE FUNCTION preserve.refuse_change()', t || '_worm_truncate', t);
  END LOOP;
END $do$;

GRANT USAGE ON SCHEMA preserve TO ih35_app;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA preserve TO ih35_app;
REVOKE UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA preserve FROM ih35_app;

COMMIT;
