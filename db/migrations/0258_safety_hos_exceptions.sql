BEGIN;

CREATE TABLE IF NOT EXISTS safety.hos_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  exception_type TEXT NOT NULL,
  exception_date DATE NOT NULL,
  justification TEXT NOT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.hos_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hos_exceptions_tenant_scope ON safety.hos_exceptions;
CREATE POLICY hos_exceptions_tenant_scope
  ON safety.hos_exceptions
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.hos_exceptions TO ih35_app;

COMMIT;
