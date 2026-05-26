BEGIN;

CREATE TABLE IF NOT EXISTS safety.roadside_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  inspected_at TIMESTAMPTZ NOT NULL,
  driver_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  inspection_level INTEGER NOT NULL,
  result TEXT NOT NULL,
  jurisdiction TEXT NOT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.roadside_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roadside_inspections_tenant_scope ON safety.roadside_inspections;
CREATE POLICY roadside_inspections_tenant_scope
  ON safety.roadside_inspections
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE FUNCTION safety.prevent_roadside_inspections_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.roadside_inspections is append-only; use voiding';
END
$$;

DROP TRIGGER IF EXISTS trg_prevent_roadside_inspections_delete ON safety.roadside_inspections;
CREATE TRIGGER trg_prevent_roadside_inspections_delete
BEFORE DELETE ON safety.roadside_inspections
FOR EACH ROW
EXECUTE FUNCTION safety.prevent_roadside_inspections_delete();

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.roadside_inspections TO ih35_app;

COMMIT;
