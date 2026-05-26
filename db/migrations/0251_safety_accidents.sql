BEGIN;

CREATE TABLE IF NOT EXISTS safety.accidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  happened_at TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  driver_id UUID NULL,
  unit_id UUID NULL,
  accident_type TEXT NOT NULL,
  narrative TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.accidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS accidents_tenant_scope ON safety.accidents;
CREATE POLICY accidents_tenant_scope
  ON safety.accidents
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE FUNCTION safety.prevent_accidents_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.accidents is append-only; use voiding';
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_accidents_delete ON safety.accidents;
CREATE TRIGGER trg_prevent_accidents_delete
BEFORE DELETE ON safety.accidents
FOR EACH ROW
EXECUTE FUNCTION safety.prevent_accidents_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.accidents TO ih35_app;

COMMIT;
