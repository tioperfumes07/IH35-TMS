-- 0300_create_fuel_transactions.sql
-- Canonical fuel.fuel_transactions for aggregate + integrity + banking paths.
BEGIN;

CREATE TABLE IF NOT EXISTS fuel.fuel_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  transaction_at timestamptz NOT NULL DEFAULT now(),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  load_id uuid NULL REFERENCES mdata.loads(id) ON DELETE SET NULL,
  driver_id uuid NULL REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  unit_id uuid NULL REFERENCES mdata.units(id) ON DELETE SET NULL,
  vendor_id uuid NULL,
  fuel_card_id uuid NULL,
  fuel_type text NOT NULL DEFAULT 'diesel'
    CHECK (fuel_type IN ('diesel', 'def', 'gas', 'reefer_diesel', 'other')),
  gallons numeric(10, 3) NULL,
  price_per_gallon numeric(10, 4) NULL,
  total_cost numeric(12, 2) NOT NULL DEFAULT 0,
  location_city text NULL,
  location_state text NULL,
  location_lat numeric(9, 6) NULL,
  location_lng numeric(9, 6) NULL,
  pump_number int NULL,
  transaction_reference text NULL,
  qbo_expense_id text NULL,
  qbo_class_id text NULL,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'import', 'wex', 'efs', 'comdata', 'samsara', 'other')),
  notes text NULL,
  imported_at timestamptz NULL,
  archived_at timestamptz NULL,
  load_required boolean NOT NULL DEFAULT true,
  load_exemption_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NULL,
  updated_by_user_id uuid NULL
);

ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS transaction_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS purchased_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS load_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS load_exemption_reason text NULL;

CREATE INDEX IF NOT EXISTS fuel_tx_company_date_idx
  ON fuel.fuel_transactions (operating_company_id, transaction_at DESC);
CREATE INDEX IF NOT EXISTS fuel_tx_company_purchased_idx
  ON fuel.fuel_transactions (operating_company_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS fuel_tx_company_load_idx
  ON fuel.fuel_transactions (operating_company_id, load_id)
  WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fuel_tx_company_unit_date_idx
  ON fuel.fuel_transactions (operating_company_id, unit_id, transaction_at DESC)
  WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fuel_tx_company_driver_date_idx
  ON fuel.fuel_transactions (operating_company_id, driver_id, transaction_at DESC)
  WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fuel_tx_active_idx
  ON fuel.fuel_transactions (operating_company_id, transaction_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_txn_load
  ON fuel.fuel_transactions (load_id)
  WHERE load_id IS NOT NULL;

ALTER TABLE fuel.fuel_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_tx_company_isolation ON fuel.fuel_transactions;
CREATE POLICY fuel_tx_company_isolation ON fuel.fuel_transactions
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

DROP TRIGGER IF EXISTS trg_fuel_txn_updated_at ON fuel.fuel_transactions;
CREATE TRIGGER trg_fuel_txn_updated_at
  BEFORE UPDATE ON fuel.fuel_transactions
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

DROP TRIGGER IF EXISTS trg_fuel_txn_load_fk ON fuel.fuel_transactions;
CREATE TRIGGER trg_fuel_txn_load_fk
  BEFORE INSERT OR UPDATE ON fuel.fuel_transactions
  FOR EACH ROW
  EXECUTE FUNCTION accounting.enforce_load_fk_invariant();

GRANT SELECT, INSERT, UPDATE ON fuel.fuel_transactions TO ih35_app;

COMMIT;
