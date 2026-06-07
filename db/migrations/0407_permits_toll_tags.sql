-- GAP-85: unit-level permits (oversize/overweight/hazmat) and toll tag tracking

BEGIN;

CREATE SCHEMA IF NOT EXISTS master_data;

CREATE TABLE IF NOT EXISTS master_data.unit_permits (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_uuid uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  permit_type text NOT NULL CHECK (
    permit_type IN ('oversize', 'overweight', 'hazmat', 'idle', 'specialized')
  ),
  issuing_state text NOT NULL,
  permit_number text NOT NULL,
  effective_date date NOT NULL,
  expiration_date date NOT NULL,
  cost numeric(8, 2),
  notes text,
  pdf_evidence_uuid uuid,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS master_data.unit_toll_tags (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  unit_uuid uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  tag_network text NOT NULL CHECK (
    tag_network IN ('txtag', 'ezpass', 'ipass', 'sunpass', 'fastrak', 'prepass')
  ),
  tag_number text NOT NULL,
  activated_at date NOT NULL,
  deactivated_at date,
  monthly_fee numeric(6, 2),
  balance_current numeric(8, 2),
  auto_replenish boolean NOT NULL DEFAULT true,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permits_unit_exp
  ON master_data.unit_permits (unit_uuid, expiration_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_toll_tags_unit
  ON master_data.unit_toll_tags (unit_uuid)
  WHERE deleted_at IS NULL;

ALTER TABLE master_data.unit_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_data.unit_toll_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unit_permits_tenant_scope ON master_data.unit_permits;
CREATE POLICY unit_permits_tenant_scope
  ON master_data.unit_permits
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS unit_toll_tags_tenant_scope ON master_data.unit_toll_tags;
CREATE POLICY unit_toll_tags_tenant_scope
  ON master_data.unit_toll_tags
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON master_data.unit_permits TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON master_data.unit_toll_tags TO ih35_app;

COMMIT;
