BEGIN;

CREATE TABLE IF NOT EXISTS safety.training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  training_name TEXT NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  expiry_date DATE NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS safety.driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  doc_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  effective_date DATE NULL,
  expiry_date DATE NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.driver_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_records_tenant_scope ON safety.training_records;
CREATE POLICY training_records_tenant_scope
  ON safety.training_records
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS driver_documents_tenant_scope ON safety.driver_documents;
CREATE POLICY driver_documents_tenant_scope
  ON safety.driver_documents
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.training_records TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety.driver_documents TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_training_records_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_training_records_updated_at ON safety.training_records;
CREATE TRIGGER trg_touch_training_records_updated_at
BEFORE UPDATE ON safety.training_records
FOR EACH ROW
EXECUTE FUNCTION safety.touch_training_records_updated_at();

CREATE OR REPLACE FUNCTION safety.touch_driver_documents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_driver_documents_updated_at ON safety.driver_documents;
CREATE TRIGGER trg_touch_driver_documents_updated_at
BEFORE UPDATE ON safety.driver_documents
FOR EACH ROW
EXECUTE FUNCTION safety.touch_driver_documents_updated_at();

COMMIT;
