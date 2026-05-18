BEGIN;

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS qbo_vendor_id text;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS qbo_customer_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_vendors_company_qbo_vendor_id
  ON mdata.vendors (operating_company_id, qbo_vendor_id)
  WHERE qbo_vendor_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_customers_company_qbo_customer_id
  ON mdata.customers (operating_company_id, qbo_customer_id)
  WHERE qbo_customer_id IS NOT NULL;

COMMIT;
