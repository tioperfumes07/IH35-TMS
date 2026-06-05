-- CATALOG-1: excel upload job tracking for generic catalog framework imports.
BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.excel_upload_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_name text NOT NULL,
  file_url text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  rows_total integer NOT NULL DEFAULT 0,
  rows_succeeded integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS excel_upload_jobs_catalog_name_idx
  ON catalogs.excel_upload_jobs (catalog_name, started_at DESC);

GRANT SELECT, INSERT, UPDATE ON catalogs.excel_upload_jobs TO ih35_app;

COMMIT;
