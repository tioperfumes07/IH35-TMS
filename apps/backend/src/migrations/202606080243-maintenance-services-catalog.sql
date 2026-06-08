-- CLOSURE-11: Maintenance services catalog with interval tracking.
BEGIN;

CREATE TABLE IF NOT EXISTS mdata.maintenance_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  service_code text NOT NULL,
  service_name text NOT NULL,
  service_category text NOT NULL,
  applies_to_type text NOT NULL DEFAULT 'all' CHECK (
    applies_to_type IN ('truck', 'trailer', 'reefer', 'all')
  ),
  interval_miles int,
  interval_months int,
  interval_hours int,
  reset_on_completion boolean NOT NULL DEFAULT true,
  is_safety_critical boolean NOT NULL DEFAULT false,
  typical_duration_hours numeric(6,2),
  typical_cost_cents bigint NOT NULL DEFAULT 0 CHECK (typical_cost_cents >= 0),
  compliance_ref text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, service_code)
);

CREATE INDEX IF NOT EXISTS ix_maint_services_company_type
  ON mdata.maintenance_services (operating_company_id, applies_to_type, is_active);

ALTER TABLE mdata.maintenance_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_services_tenant_scope ON mdata.maintenance_services;
CREATE POLICY maintenance_services_tenant_scope ON mdata.maintenance_services
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON mdata.maintenance_services TO ih35_app;

COMMIT;
