-- CAP-FUEL-CARD-MATCH: fuel card transaction to GPS proximity matching.
BEGIN;

CREATE SCHEMA IF NOT EXISTS safety;

CREATE TABLE IF NOT EXISTS safety.fuel_gps_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  fuel_txn_id uuid NOT NULL REFERENCES banking.bank_transactions(id) ON DELETE CASCADE,
  vehicle_id uuid NULL REFERENCES mdata.units(id),
  distance_m numeric(10,2) NULL,
  confidence text NOT NULL CHECK (confidence IN ('high', 'medium', 'no_match')),
  matched_at timestamptz NOT NULL DEFAULT now(),
  review_flag boolean NOT NULL DEFAULT false,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_gps_matches_txn_unique UNIQUE (operating_company_id, fuel_txn_id)
);

CREATE INDEX IF NOT EXISTS idx_fuel_gps_matches_company_confidence
  ON safety.fuel_gps_matches (operating_company_id, confidence, matched_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_gps_matches_company_vehicle
  ON safety.fuel_gps_matches (operating_company_id, vehicle_id, matched_at DESC);

ALTER TABLE safety.fuel_gps_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fuel_gps_matches_company_scope ON safety.fuel_gps_matches;
CREATE POLICY fuel_gps_matches_company_scope ON safety.fuel_gps_matches
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.fuel_gps_matches TO ih35_app;

COMMIT;
