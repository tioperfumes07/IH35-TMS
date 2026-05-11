BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.load_stops') IS NULL THEN
    RAISE NOTICE 'Skipping 0111: mdata.load_stops table not present';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mdata'
      AND t.typname = 'time_window_type_enum'
  ) THEN
    CREATE TYPE mdata.time_window_type_enum AS ENUM ('appointment', 'first_come_first_serve', 'drop_window');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'mdata'
      AND t.typname = 'lumper_paid_by_enum'
  ) THEN
    CREATE TYPE mdata.lumper_paid_by_enum AS ENUM ('carrier', 'shipper', 'broker', 'receiver', 'unknown');
  END IF;

  ALTER TABLE mdata.load_stops
    ADD COLUMN IF NOT EXISTS time_window_type mdata.time_window_type_enum NOT NULL DEFAULT 'appointment',
    ADD COLUMN IF NOT EXISTS appointment_start_at timestamptz,
    ADD COLUMN IF NOT EXISTS appointment_end_at timestamptz,
    ADD COLUMN IF NOT EXISTS is_extra_stop boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_tarp_stop boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tarp_count integer NOT NULL DEFAULT 0 CHECK (tarp_count >= 0),
    ADD COLUMN IF NOT EXISTS lumper_required boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lumper_paid_by mdata.lumper_paid_by_enum NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS lumper_amount_cents integer NOT NULL DEFAULT 0 CHECK (lumper_amount_cents >= 0),
    ADD COLUMN IF NOT EXISTS stop_notes text;
END $$;

CREATE OR REPLACE FUNCTION mdata.refresh_is_extra_stop(p_load_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $func$
DECLARE
  v_first_pickup_seq int;
  v_last_delivery_seq int;
BEGIN
  SELECT MIN(sequence_number) INTO v_first_pickup_seq
  FROM mdata.load_stops
  WHERE load_id = p_load_id
    AND stop_type = 'pickup';

  SELECT MAX(sequence_number) INTO v_last_delivery_seq
  FROM mdata.load_stops
  WHERE load_id = p_load_id
    AND stop_type = 'delivery';

  UPDATE mdata.load_stops ls
  SET is_extra_stop = CASE
    WHEN ls.stop_type IN ('fuel', 'rest', 'border') THEN true
    WHEN v_first_pickup_seq IS NULL OR v_last_delivery_seq IS NULL THEN false
    WHEN ls.sequence_number = v_first_pickup_seq THEN false
    WHEN ls.sequence_number = v_last_delivery_seq THEN false
    ELSE true
  END,
  updated_at = now()
  WHERE ls.load_id = p_load_id;
END;
$func$;

CREATE OR REPLACE FUNCTION mdata.trg_refresh_is_extra_stop()
RETURNS trigger
LANGUAGE plpgsql
AS $trg$
DECLARE
  v_load_id uuid;
BEGIN
  v_load_id := COALESCE(NEW.load_id, OLD.load_id);
  PERFORM mdata.refresh_is_extra_stop(v_load_id);
  RETURN COALESCE(NEW, OLD);
END;
$trg$;

DROP TRIGGER IF EXISTS trg_refresh_is_extra_stop ON mdata.load_stops;
CREATE TRIGGER trg_refresh_is_extra_stop
AFTER INSERT OR UPDATE OR DELETE ON mdata.load_stops
FOR EACH ROW
EXECUTE FUNCTION mdata.trg_refresh_is_extra_stop();

COMMIT;
