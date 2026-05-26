BEGIN;

CREATE TABLE IF NOT EXISTS safety.background_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  check_type TEXT NOT NULL,
  result TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry_date DATE NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.background_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS background_checks_tenant_scope ON safety.background_checks;
CREATE POLICY background_checks_tenant_scope
  ON safety.background_checks
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.background_checks TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_background_checks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_background_checks_updated_at ON safety.background_checks;
CREATE TRIGGER trg_touch_background_checks_updated_at
BEFORE UPDATE ON safety.background_checks
FOR EACH ROW
EXECUTE FUNCTION safety.touch_background_checks_updated_at();

COMMIT;
