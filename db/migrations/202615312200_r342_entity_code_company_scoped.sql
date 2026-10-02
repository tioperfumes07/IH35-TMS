-- ROUND 342 Class D (Cursor lane) — company-scope the three master-data code uniqueness keys.
-- Claimed: 202615312200 (CLAIM-RESERVE #24287 → tip 931d34f71e). Cursor HH 22.
--
-- BEFORE (Neon br-fancy-credit, bypass_rls=lucia):
--   customers_customer_code_key  UNIQUE CONSTRAINT (customer_code)   -- global across all carriers
--   vendors_vendor_code_key      UNIQUE CONSTRAINT (vendor_code)     -- global
--   locations_location_code_key  UNIQUE CONSTRAINT (location_code)   -- global
-- Measured collisions across operating_company_id: 0 / 0 / 0 (safe to re-scope).
--
-- AFTER:
--   uq_mdata_customers_company_customer_code UNIQUE (operating_company_id, customer_code)
--   uq_mdata_vendors_company_vendor_code     UNIQUE (operating_company_id, vendor_code)
--   uq_mdata_locations_company_location_code UNIQUE (operating_company_id, location_code)
--
-- The old names are CONSTRAINTS (not free-standing indexes) — DROP CONSTRAINT, then create
-- company-scoped UNIQUE INDEX. Idempotent. No DROP TABLE. No data rewrite. FORCE RLS unchanged.

-- customers
ALTER TABLE mdata.customers DROP CONSTRAINT IF EXISTS customers_customer_code_key;
DROP INDEX IF EXISTS mdata.customers_customer_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_customers_company_customer_code
  ON mdata.customers (operating_company_id, customer_code)
  WHERE customer_code IS NOT NULL;

-- vendors
ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_code_key;
DROP INDEX IF EXISTS mdata.vendors_vendor_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_vendors_company_vendor_code
  ON mdata.vendors (operating_company_id, vendor_code)
  WHERE vendor_code IS NOT NULL;

-- locations
ALTER TABLE mdata.locations DROP CONSTRAINT IF EXISTS locations_location_code_key;
DROP INDEX IF EXISTS mdata.locations_location_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_locations_company_location_code
  ON mdata.locations (operating_company_id, location_code)
  WHERE location_code IS NOT NULL;

COMMENT ON INDEX mdata.uq_mdata_customers_company_customer_code IS
  'ROUND 342: customer_code unique per operating_company_id (was global customers_customer_code_key).';
COMMENT ON INDEX mdata.uq_mdata_vendors_company_vendor_code IS
  'ROUND 342: vendor_code unique per operating_company_id (was global vendors_vendor_code_key).';
COMMENT ON INDEX mdata.uq_mdata_locations_company_location_code IS
  'ROUND 342: location_code unique per operating_company_id (was global locations_location_code_key).';
