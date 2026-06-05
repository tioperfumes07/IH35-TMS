-- P8-COMP-4: FMCSA SAFER verification automation (customer + carrier authority)
BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS safer_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS safer_status text,
  ADD COLUMN IF NOT EXISTS safer_authority_status text,
  ADD COLUMN IF NOT EXISTS safer_oos_status text;

ALTER TABLE mdata.customers
  DROP CONSTRAINT IF EXISTS ck_mdata_customers_safer_status;
ALTER TABLE mdata.customers
  ADD CONSTRAINT ck_mdata_customers_safer_status
  CHECK (
    safer_status IS NULL
    OR safer_status IN ('verified', 'inactive', 'revoked', 'not_found', 'missing_lookup', 'lookup_failed')
  );

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS mc_number text,
  ADD COLUMN IF NOT EXISTS dot_number text,
  ADD COLUMN IF NOT EXISTS safer_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS safer_status text,
  ADD COLUMN IF NOT EXISTS safer_authority_status text,
  ADD COLUMN IF NOT EXISTS safer_oos_status text;

ALTER TABLE mdata.vendors
  DROP CONSTRAINT IF EXISTS ck_mdata_vendors_safer_status;
ALTER TABLE mdata.vendors
  ADD CONSTRAINT ck_mdata_vendors_safer_status
  CHECK (
    safer_status IS NULL
    OR safer_status IN ('verified', 'inactive', 'revoked', 'not_found', 'missing_lookup', 'lookup_failed')
  );

CREATE INDEX IF NOT EXISTS idx_mdata_customers_safer_verified_at
  ON mdata.customers (safer_verified_at)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mdata_vendors_safer_verified_at
  ON mdata.vendors (safer_verified_at)
  WHERE deactivated_at IS NULL;

COMMIT;
