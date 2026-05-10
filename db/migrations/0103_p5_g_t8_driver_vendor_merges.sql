BEGIN;

CREATE TABLE IF NOT EXISTS mdata.driver_vendor_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  from_qbo_vendor_id text NOT NULL,
  to_qbo_vendor_id text NOT NULL,
  merge_reason text NOT NULL DEFAULT 'duplicate_vendor_cleanup',
  merged_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(from_qbo_vendor_id)) > 0),
  CHECK (length(trim(to_qbo_vendor_id)) > 0),
  CHECK (from_qbo_vendor_id <> to_qbo_vendor_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_vendor_merges_once
  ON mdata.driver_vendor_merges (operating_company_id, driver_id, from_qbo_vendor_id, to_qbo_vendor_id);
CREATE INDEX IF NOT EXISTS idx_driver_vendor_merges_company_recent
  ON mdata.driver_vendor_merges (operating_company_id, merged_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_vendor_merges_driver_recent
  ON mdata.driver_vendor_merges (driver_id, merged_at DESC);

ALTER TABLE mdata.driver_vendor_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_driver_vendor_merges_isolation ON mdata.driver_vendor_merges;
CREATE POLICY rls_driver_vendor_merges_isolation
  ON mdata.driver_vendor_merges
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

COMMIT;
