-- P6-T11171 — Book Load wizard v4 additive fields (mdata.loads / mdata.load_stops)
-- Idempotent; RLS policies unchanged (column add-only).

BEGIN;

-- Reservation TTL default: 60 seconds for new rows
ALTER TABLE dispatch.load_id_reservations
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '60 seconds');

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NULL THEN
    RAISE NOTICE 'Skipping 0140 loads: mdata.loads missing';
  ELSE
    ALTER TABLE mdata.loads
      ADD COLUMN IF NOT EXISTS driver_instructions_text TEXT,
      ADD COLUMN IF NOT EXISTS anticipated_chargeback_cents INTEGER CHECK (anticipated_chargeback_cents IS NULL OR anticipated_chargeback_cents >= 0),
      ADD COLUMN IF NOT EXISTS anticipated_chargeback_reason TEXT,
      ADD COLUMN IF NOT EXISTS detention_expected_y_n BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS detention_expected_hours NUMERIC(4, 2),
      ADD COLUMN IF NOT EXISTS detention_bill_customer_per_hour_cents INTEGER CHECK (
        detention_bill_customer_per_hour_cents IS NULL OR detention_bill_customer_per_hour_cents >= 0
      ),
      ADD COLUMN IF NOT EXISTS detention_driver_pay_per_hour_cents INTEGER CHECK (
        detention_driver_pay_per_hour_cents IS NULL OR detention_driver_pay_per_hour_cents >= 0
      ),
      ADD COLUMN IF NOT EXISTS late_delivery_risk_y_n BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS late_delivery_est_deduction_cents INTEGER CHECK (
        late_delivery_est_deduction_cents IS NULL OR late_delivery_est_deduction_cents >= 0
      ),
      ADD COLUMN IF NOT EXISTS late_delivery_reason TEXT,
      ADD COLUMN IF NOT EXISTS ocr_source_pdf_r2_key TEXT,
      ADD COLUMN IF NOT EXISTS miles_practical INTEGER CHECK (miles_practical IS NULL OR miles_practical >= 0),
      ADD COLUMN IF NOT EXISTS miles_shortest INTEGER CHECK (miles_shortest IS NULL OR miles_shortest >= 0),
      ADD COLUMN IF NOT EXISTS miles_deadhead INTEGER CHECK (miles_deadhead IS NULL OR miles_deadhead >= 0),
      ADD COLUMN IF NOT EXISTS customer_wo_number TEXT,
      ADD COLUMN IF NOT EXISTS pickup_number TEXT,
      ADD COLUMN IF NOT EXISTS border_routing TEXT;
  END IF;
END $$;

DO $$
DECLARE
  col_udt text;
BEGIN
  IF to_regclass('mdata.load_stops') IS NULL THEN
    RAISE NOTICE 'Skipping 0140 load_stops: table missing';
    RETURN;
  END IF;

  ALTER TABLE mdata.load_stops
    ADD COLUMN IF NOT EXISTS site_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS site_contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS gate_dock_text TEXT;

  SELECT c.udt_name INTO col_udt
  FROM information_schema.columns c
  WHERE c.table_schema = 'mdata'
    AND c.table_name = 'load_stops'
    AND c.column_name = 'time_window_type';

  IF col_udt IS NULL THEN
    ALTER TABLE mdata.load_stops
      ADD COLUMN IF NOT EXISTS time_window_type TEXT NOT NULL DEFAULT 'appointment';
  ELSIF col_udt = 'time_window_type_enum' THEN
    ALTER TABLE mdata.load_stops ALTER COLUMN time_window_type DROP DEFAULT;
    ALTER TABLE mdata.load_stops
      ALTER COLUMN time_window_type TYPE text USING (
        CASE time_window_type::text
          WHEN 'first_come_first_serve' THEN 'open_window'
          WHEN 'drop_window' THEN 'select_hours'
          ELSE time_window_type::text
        END
      );
    ALTER TABLE mdata.load_stops ALTER COLUMN time_window_type SET DEFAULT 'appointment';
  END IF;

  UPDATE mdata.load_stops
  SET time_window_type = 'appointment'
  WHERE time_window_type IS NOT NULL
    AND time_window_type NOT IN ('appointment', 'open_window', 'select_hours', 'refused');

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'load_stops_time_window_type_v4_chk'
  ) THEN
    ALTER TABLE mdata.load_stops
      ADD CONSTRAINT load_stops_time_window_type_v4_chk
      CHECK (
        time_window_type IN ('appointment', 'open_window', 'select_hours', 'refused')
      );
  END IF;
END $$;

COMMIT;
