-- CATALOG-1: Generic catalog framework — Excel/CSV bulk upload job tracking
BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.excel_upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_name text NOT NULL,
  file_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  rows_total int,
  rows_succeeded int,
  rows_failed int,
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
);

ALTER TABLE catalogs.excel_upload_jobs
  DROP CONSTRAINT IF EXISTS ck_catalogs_excel_upload_jobs_status;
ALTER TABLE catalogs.excel_upload_jobs
  ADD CONSTRAINT ck_catalogs_excel_upload_jobs_status
  CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS idx_catalogs_excel_upload_jobs_catalog_started
  ON catalogs.excel_upload_jobs (catalog_name, started_at DESC);

COMMENT ON TABLE catalogs.excel_upload_jobs IS
  'Tracks async catalog Excel/CSV import jobs for the generic catalog framework.';

GRANT SELECT, INSERT, UPDATE ON catalogs.excel_upload_jobs TO ih35_app;
ALTER TABLE catalogs.excel_upload_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.excel_upload_jobs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS excel_upload_jobs_select_all ON catalogs.excel_upload_jobs;
CREATE POLICY excel_upload_jobs_select_all ON catalogs.excel_upload_jobs
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS excel_upload_jobs_insert_admin ON catalogs.excel_upload_jobs;
CREATE POLICY excel_upload_jobs_insert_admin ON catalogs.excel_upload_jobs
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS excel_upload_jobs_update_admin ON catalogs.excel_upload_jobs;
CREATE POLICY excel_upload_jobs_update_admin ON catalogs.excel_upload_jobs
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator'))
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator'));

DROP POLICY IF EXISTS excel_upload_jobs_lucia_bypass ON catalogs.excel_upload_jobs;
CREATE POLICY excel_upload_jobs_lucia_bypass ON catalogs.excel_upload_jobs
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

COMMIT;
