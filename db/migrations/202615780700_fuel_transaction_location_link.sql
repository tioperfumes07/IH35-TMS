-- 202615780700_fuel_transaction_location_link.sql
-- CC-2 · LEAD 443.105 (owner 2026-10-12 07:50 CT: "Every engine ... must record correctly with truck / driver / load / trailer /
-- vendor / item / account"). verify-form-field-roundtrip: the office fuel-transaction form lets the operator pick the fuel stop
-- (FuelStopLocationPicker -> mdata.locations) but fuel.fuel_transactions had no column for it — only the stop's readable text
-- (location_city / location_state) was saved and the link to the location record was dropped.
--
-- Adds fuel.fuel_transactions.location_id -> mdata.locations(id), plus a same-company composite FK
-- (operating_company_id, location_id) -> mdata.locations(operating_company_id, id) (uq_locations_company_id) so a fuel row can
-- never name another company's stop. Nullable: historical rows and imports without a picked stop stay NULL; the text columns
-- are kept. Idempotent; lock_timeout 60s.
BEGIN;
SET LOCAL lock_timeout = '60s';

ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES mdata.locations(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'fuel.fuel_transactions'::regclass AND conname = 'fuel_transactions_location_same_company_fkey'
  ) THEN
    ALTER TABLE fuel.fuel_transactions
      ADD CONSTRAINT fuel_transactions_location_same_company_fkey
      FOREIGN KEY (operating_company_id, location_id) REFERENCES mdata.locations (operating_company_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fuel_transactions_location_id ON fuel.fuel_transactions (location_id) WHERE location_id IS NOT NULL;

COMMENT ON COLUMN fuel.fuel_transactions.location_id IS
  'LEAD 443.105: the fuel stop (mdata.locations) the office picked for this purchase; same company enforced by fuel_transactions_location_same_company_fkey.';

COMMIT;
