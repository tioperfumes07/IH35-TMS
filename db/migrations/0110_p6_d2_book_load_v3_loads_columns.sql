BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NULL THEN
    RAISE NOTICE 'Skipping 0110: mdata.loads table not present';
    RETURN;
  END IF;

  ALTER TABLE mdata.loads
    ADD COLUMN IF NOT EXISTS team_id uuid,
    ADD COLUMN IF NOT EXISTS booking_mode TEXT NOT NULL DEFAULT 'single_popup'
      CHECK (booking_mode IN ('single_popup', 'legacy_form')),
    ADD COLUMN IF NOT EXISTS requires_tarps BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tarp_type TEXT,
    ADD COLUMN IF NOT EXISTS lumper_amount_cents INTEGER NOT NULL DEFAULT 0
      CHECK (lumper_amount_cents >= 0),
    ADD COLUMN IF NOT EXISTS presettlement_link_id UUID,
    ADD COLUMN IF NOT EXISTS customer_chargeback_requested BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS customer_chargeback_reason TEXT,
    ADD COLUMN IF NOT EXISTS live_load_number TEXT,
    ADD COLUMN IF NOT EXISTS booked_by_user_id UUID REFERENCES identity.users(id),
    ADD COLUMN IF NOT EXISTS updated_by_user_id UUID REFERENCES identity.users(id),
    ADD COLUMN IF NOT EXISTS driver_instructions_file_id UUID REFERENCES docs.files(id);
END $$;

CREATE INDEX IF NOT EXISTS idx_loads_chargeback_requested
  ON mdata.loads (operating_company_id, customer_chargeback_requested)
  WHERE customer_chargeback_requested = true;

CREATE INDEX IF NOT EXISTS idx_loads_live_load_number
  ON mdata.loads (operating_company_id, live_load_number)
  WHERE live_load_number IS NOT NULL;

COMMIT;
