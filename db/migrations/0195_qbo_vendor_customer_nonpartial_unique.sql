-- 0195: replace partial qbo unique indexes from 0193 with non-partial unique
-- indexes so 0194's ON CONFLICT (column-list) can match them. SQLSTATE 42P10
-- root-cause fix. Partial WHERE clause was unnecessary: a unique index already
-- permits multiple NULLs. Additive + idempotent.
BEGIN;

DROP INDEX IF EXISTS mdata.uq_mdata_vendors_company_qbo_vendor_id;
DROP INDEX IF EXISTS mdata.uq_mdata_customers_company_qbo_customer_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_vendors_company_qbo_vendor_id
  ON mdata.vendors (operating_company_id, qbo_vendor_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_customers_company_qbo_customer_id
  ON mdata.customers (operating_company_id, qbo_customer_id);

COMMIT;
