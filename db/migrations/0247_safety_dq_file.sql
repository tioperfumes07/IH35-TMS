BEGIN;

CREATE TABLE IF NOT EXISTS safety.driver_qualification_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'present',
  effective_date DATE NULL,
  expiry_date DATE NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.driver_qualification_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_qualification_files_tenant_scope ON safety.driver_qualification_files;
CREATE POLICY driver_qualification_files_tenant_scope
  ON safety.driver_qualification_files
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.driver_qualification_files TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_driver_qualification_files_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_qualification_files_updated_at ON safety.driver_qualification_files;
CREATE TRIGGER trg_touch_driver_qualification_files_updated_at
BEFORE UPDATE ON safety.driver_qualification_files
FOR EACH ROW
EXECUTE FUNCTION safety.touch_driver_qualification_files_updated_at();

COMMIT;
