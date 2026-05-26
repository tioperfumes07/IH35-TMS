BEGIN;

CREATE TABLE IF NOT EXISTS safety.training_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  frequency TEXT NOT NULL,
  passing_grade TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.training_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_programs_tenant_scope ON safety.training_programs;
CREATE POLICY training_programs_tenant_scope
  ON safety.training_programs
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.training_programs TO ih35_app;

COMMIT;
