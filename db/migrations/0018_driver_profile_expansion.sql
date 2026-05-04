BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS visa_type text,
  ADD COLUMN IF NOT EXISTS visa_number text,
  ADD COLUMN IF NOT EXISTS visa_expires_at date,
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS passport_expires_at date,
  ADD COLUMN IF NOT EXISTS ine_number text,
  ADD COLUMN IF NOT EXISTS curp text,
  ADD COLUMN IF NOT EXISTS mx_address_line1 text,
  ADD COLUMN IF NOT EXISTS mx_address_line2 text,
  ADD COLUMN IF NOT EXISTS mx_city text,
  ADD COLUMN IF NOT EXISTS mx_state text,
  ADD COLUMN IF NOT EXISTS mx_postal_code text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone_primary text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone_alternate text,
  ADD COLUMN IF NOT EXISTS emergency_contact_address text,
  ADD COLUMN IF NOT EXISTS emergency_contact_notes text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_curp_unique
  ON mdata.drivers (curp)
  WHERE curp IS NOT NULL AND deactivated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_ine_unique
  ON mdata.drivers (ine_number)
  WHERE ine_number IS NOT NULL AND deactivated_at IS NULL;

COMMENT ON COLUMN mdata.drivers.visa_type IS 'Visa category, e.g., B1 (cross-border commercial), B2, etc. Required for non-US drivers.';
COMMENT ON COLUMN mdata.drivers.curp IS 'Clave Única de Registro de Población. 18-character Mexican unique national ID. Required for B1/Mexican drivers.';
COMMENT ON COLUMN mdata.drivers.ine_number IS 'Instituto Nacional Electoral ID number. Mexican voter ID, used as primary national ID.';
COMMENT ON COLUMN mdata.drivers.emergency_contact_phone_primary IS 'E.164 format preferred but stored as-is.';

CREATE TABLE IF NOT EXISTS mdata.driver_equipment_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  equipment_type_id uuid NOT NULL REFERENCES catalogs.equipment_types(id) ON DELETE RESTRICT,
  is_active boolean NOT NULL DEFAULT true,
  qualified_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  UNIQUE (driver_id, equipment_type_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_qualifications_driver
  ON mdata.driver_equipment_qualifications (driver_id) WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_driver_qualifications_equipment_type
  ON mdata.driver_equipment_qualifications (equipment_type_id) WHERE deactivated_at IS NULL;

COMMENT ON TABLE mdata.driver_equipment_qualifications IS 'Which equipment types each driver is qualified for. A driver can be qualified on multiple equipment types. Pay rates per (qualification, line item) live in driver_pay_rates with effective dating.';
COMMENT ON COLUMN mdata.driver_equipment_qualifications.is_active IS 'When false, driver is no longer assigned loads of this equipment type but historical settlements still reference this qualification.';

GRANT SELECT, INSERT, UPDATE ON mdata.driver_equipment_qualifications TO ih35_app;
ALTER TABLE mdata.driver_equipment_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_equipment_qualifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dq_select_all ON mdata.driver_equipment_qualifications;
CREATE POLICY dq_select_all ON mdata.driver_equipment_qualifications
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS dq_insert_admin_manager ON mdata.driver_equipment_qualifications;
CREATE POLICY dq_insert_admin_manager ON mdata.driver_equipment_qualifications
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager'));

DROP POLICY IF EXISTS dq_update_admin_manager ON mdata.driver_equipment_qualifications;
CREATE POLICY dq_update_admin_manager ON mdata.driver_equipment_qualifications
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager'))
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager'));

DROP POLICY IF EXISTS dq_lucia_bypass ON mdata.driver_equipment_qualifications;
CREATE POLICY dq_lucia_bypass ON mdata.driver_equipment_qualifications
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'pay_rate_change_reason'
      AND n.nspname = 'mdata'
  ) THEN
    CREATE TYPE mdata.pay_rate_change_reason AS ENUM (
      'raise',
      'demotion',
      'contract_renegotiation',
      'annual_adjustment',
      'promotion',
      'correction',
      'other'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mdata.driver_pay_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_qualification_id uuid NOT NULL REFERENCES mdata.driver_equipment_qualifications(id) ON DELETE CASCADE,
  line_item_template_id uuid NOT NULL REFERENCES catalogs.equipment_line_item_templates(id) ON DELETE RESTRICT,
  amount numeric(10, 4) NOT NULL CHECK (amount >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  change_reason mdata.pay_rate_change_reason NOT NULL DEFAULT 'other',
  change_notes text,
  previous_rate_id uuid REFERENCES mdata.driver_pay_rates(id),
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid,
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_driver_pay_rates_qualification_current
  ON mdata.driver_pay_rates (driver_qualification_id, line_item_template_id)
  WHERE effective_to IS NULL AND deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_pay_rates_qualification_history
  ON mdata.driver_pay_rates (driver_qualification_id, effective_from DESC);

COMMENT ON TABLE mdata.driver_pay_rates IS 'Effective-dated pay rates per driver-qualification-lineitem. Append-only history: changing a rate creates a new row and closes the old row by setting effective_to. Settlements query the rate active on the load completion date.';
COMMENT ON COLUMN mdata.driver_pay_rates.amount IS 'Rate amount in USD. Format depends on line item unit: per_loaded_mile = $/mile (e.g., 0.50), flat_per_occurrence = $ per occurrence (e.g., 50.00), percent_of_load_revenue = decimal (e.g., 0.25 for 25%).';
COMMENT ON COLUMN mdata.driver_pay_rates.effective_from IS 'Date this rate becomes effective (inclusive).';
COMMENT ON COLUMN mdata.driver_pay_rates.effective_to IS 'Date this rate stopped being effective (inclusive). NULL = still current.';
COMMENT ON COLUMN mdata.driver_pay_rates.previous_rate_id IS 'Pointer to the rate this one replaced. NULL for the first rate ever set.';

GRANT SELECT, INSERT, UPDATE ON mdata.driver_pay_rates TO ih35_app;
ALTER TABLE mdata.driver_pay_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_pay_rates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pay_rates_select_all ON mdata.driver_pay_rates;
CREATE POLICY pay_rates_select_all ON mdata.driver_pay_rates
  FOR SELECT TO ih35_app USING (true);

DROP POLICY IF EXISTS pay_rates_insert_admin_manager ON mdata.driver_pay_rates;
CREATE POLICY pay_rates_insert_admin_manager ON mdata.driver_pay_rates
  FOR INSERT TO ih35_app
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager'));

DROP POLICY IF EXISTS pay_rates_update_admin_manager ON mdata.driver_pay_rates;
CREATE POLICY pay_rates_update_admin_manager ON mdata.driver_pay_rates
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager'))
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager'));

DROP POLICY IF EXISTS pay_rates_lucia_bypass ON mdata.driver_pay_rates;
CREATE POLICY pay_rates_lucia_bypass ON mdata.driver_pay_rates
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

CREATE TABLE IF NOT EXISTS mdata.driver_company_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE RESTRICT,
  is_authorized boolean NOT NULL DEFAULT true,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  authorized_by_user_id uuid,
  notes text,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_dca_driver
  ON mdata.driver_company_authorizations (driver_id) WHERE deactivated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dca_company
  ON mdata.driver_company_authorizations (company_id) WHERE deactivated_at IS NULL;

COMMENT ON TABLE mdata.driver_company_authorizations IS 'Which operating companies a driver is insurance-approved to drive for. Drivers must be authorized at a company before they can be dispatched on that company''s loads. Simple boolean — no effective dating in this phase.';

GRANT SELECT, INSERT, UPDATE ON mdata.driver_company_authorizations TO ih35_app;
ALTER TABLE mdata.driver_company_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.driver_company_authorizations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dca_select_company_scoped ON mdata.driver_company_authorizations;
CREATE POLICY dca_select_company_scoped ON mdata.driver_company_authorizations
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR company_id IN (SELECT org.user_accessible_company_ids())
  );

DROP POLICY IF EXISTS dca_insert_admin_manager ON mdata.driver_company_authorizations;
CREATE POLICY dca_insert_admin_manager ON mdata.driver_company_authorizations
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Safety')
      AND company_id IN (SELECT org.user_accessible_company_ids())
    )
  );

DROP POLICY IF EXISTS dca_update_admin_manager ON mdata.driver_company_authorizations;
CREATE POLICY dca_update_admin_manager ON mdata.driver_company_authorizations
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Safety')
      AND company_id IN (SELECT org.user_accessible_company_ids())
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR company_id IN (SELECT org.user_accessible_company_ids())
  );

DROP POLICY IF EXISTS dca_lucia_bypass ON mdata.driver_company_authorizations;
CREATE POLICY dca_lucia_bypass ON mdata.driver_company_authorizations
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

COMMIT;
