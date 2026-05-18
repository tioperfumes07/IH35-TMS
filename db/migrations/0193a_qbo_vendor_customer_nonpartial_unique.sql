-- 0193a: replace the partial qbo unique indexes created by 0193 with
-- non-partial unique indexes. ON CONFLICT (column-list) cannot match a partial
-- index (WHERE clause); 0194's vendor/customer upserts need a matchable
-- constraint. Runs between 0193 and 0194 by lexical filename order. The partial
-- WHERE was unnecessary — a unique index already permits multiple NULLs.
-- Additive + idempotent.
BEGIN;
DROP INDEX IF EXISTS mdata.uq_mdata_vendors_company_qbo_vendor_id;
DROP INDEX IF EXISTS mdata.uq_mdata_customers_company_qbo_customer_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_vendors_company_qbo_vendor_id
  ON mdata.vendors (operating_company_id, qbo_vendor_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mdata_customers_company_qbo_customer_id
  ON mdata.customers (operating_company_id, qbo_customer_id);
COMMIT;
