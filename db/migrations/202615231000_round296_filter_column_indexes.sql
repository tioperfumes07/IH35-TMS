-- 202615231000_round296_filter_column_indexes.sql -- CC-3 round 296 item 3 (claim #24157).
-- The owner's filter law: "every filter column backed by a REAL INDEXED DB COLUMN -- search the DB first". Searching the
-- live DB across the 18 CC-3 filter surfaces found these filter columns with no index behind them. Additive only:
-- CREATE INDEX IF NOT EXISTS, no data change, no constraint, idempotent. All tables are small (largest ~4k rows), so a
-- plain (non-concurrent) build inside the transaction holds its lock for milliseconds.

BEGIN;
SET LOCAL lock_timeout = '5s';

-- Chart of Accounts: Show = Active / Inactive (route filters deactivated_at per company).
CREATE INDEX IF NOT EXISTS idx_catalogs_accounts_company_deactivated
  ON catalogs.accounts (operating_company_id, deactivated_at);

-- (catalogs.tire_positions is a GLOBAL catalog -- no operating_company_id column; its is_active is already indexed.)

-- Safety catalogs: the Show selector filters is_active per company.
CREATE INDEX IF NOT EXISTS idx_catalogs_cargo_claim_reasons_company_active
  ON catalogs.cargo_claim_reasons (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_catalogs_company_violation_types_company_active
  ON catalogs.company_violation_types (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_catalogs_complaint_types_company_active
  ON catalogs.complaint_types (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_catalogs_dot_violation_types_company_active
  ON catalogs.dot_violation_types (operating_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_catalogs_internal_fine_reasons_company_active
  ON catalogs.internal_fine_reasons (operating_company_id, is_active);

-- Brokers directory: customers of type broker by status, per company (only customer_type_id was indexed).
CREATE INDEX IF NOT EXISTS idx_mdata_customers_company_type_status
  ON mdata.customers (operating_company_id, customer_type, status);

-- All Documents: date range (document date) and filename search (ILIKE '%term%' -> trigram).
CREATE INDEX IF NOT EXISTS idx_docs_files_company_document_date
  ON docs.files (operating_company_id, document_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_docs_files_original_filename_trgm
  ON docs.files USING gin (original_filename public.gin_trgm_ops);

-- Samsara driver mapping: Mapped / Unmapped tabs filter local_driver_id per company.
CREATE INDEX IF NOT EXISTS idx_samsara_drivers_company_local_driver
  ON integrations.samsara_drivers (operating_company_id, local_driver_id);

COMMIT;
