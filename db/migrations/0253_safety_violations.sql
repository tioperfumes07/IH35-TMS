BEGIN;

CREATE TABLE IF NOT EXISTS safety.violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  source_type TEXT NOT NULL,
  source_event_id UUID NOT NULL,
  csa_basic TEXT NOT NULL,
  severity_weight INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS violations_tenant_scope ON safety.violations;
CREATE POLICY violations_tenant_scope
  ON safety.violations
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE FUNCTION safety.prevent_violations_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.violations is append-only; use voiding';
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_violations_delete ON safety.violations;
CREATE TRIGGER trg_prevent_violations_delete
BEFORE DELETE ON safety.violations
FOR EACH ROW
EXECUTE FUNCTION safety.prevent_violations_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.violations TO ih35_app;

COMMIT;
