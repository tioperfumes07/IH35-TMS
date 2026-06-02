-- Block 11: Vehicle Profile Part 1 — status enum, unit fields, plates, border crossings, default driver flag
BEGIN;

ALTER TYPE mdata.unit_status ADD VALUE IF NOT EXISTS 'Damaged';
ALTER TYPE mdata.unit_status ADD VALUE IF NOT EXISTS 'Transferred';

COMMIT;

BEGIN;

UPDATE mdata.units SET status = 'Damaged'::mdata.unit_status WHERE status = 'Totaled'::mdata.unit_status;

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_change_reason text,
  ADD COLUMN IF NOT EXISTS status_changed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS sold_date date,
  ADD COLUMN IF NOT EXISTS sold_to text,
  ADD COLUMN IF NOT EXISTS sold_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS transferred_date date,
  ADD COLUMN IF NOT EXISTS transferred_to_entity text
    CHECK (transferred_to_entity IN ('TRK', 'TRANSP', 'USMCA') OR transferred_to_entity IS NULL),
  ADD COLUMN IF NOT EXISTS damage_date date,
  ADD COLUMN IF NOT EXISTS damage_description text,
  ADD COLUMN IF NOT EXISTS repair_estimate numeric(12, 2),
  ADD COLUMN IF NOT EXISTS oos_date date,
  ADD COLUMN IF NOT EXISTS oos_reason text,
  ADD COLUMN IF NOT EXISTS quick_availability text
    CHECK (quick_availability IN ('available', 'booked', 'holding') OR quick_availability IS NULL);

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS texas_irp_number text,
  ADD COLUMN IF NOT EXISTS irp_account_number text,
  ADD COLUMN IF NOT EXISTS irp_registered_jurisdictions jsonb,
  ADD COLUMN IF NOT EXISTS irp_expiration date,
  ADD COLUMN IF NOT EXISTS irp_registered_weight_lbs integer,
  ADD COLUMN IF NOT EXISTS operation_country text
    CHECK (operation_country IN ('US', 'MX', 'cross_border') OR operation_country IS NULL),
  ADD COLUMN IF NOT EXISTS sct_permit_number text,
  ADD COLUMN IF NOT EXISTS sct_permit_expiration date,
  ADD COLUMN IF NOT EXISTS pita_status text,
  ADD COLUMN IF NOT EXISTS pita_permit_number text,
  ADD COLUMN IF NOT EXISTS pita_expiration date,
  ADD COLUMN IF NOT EXISTS ctpat_status text,
  ADD COLUMN IF NOT EXISTS oea_status text,
  ADD COLUMN IF NOT EXISTS hazmat_endorsement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS us_insurance_policy_number text,
  ADD COLUMN IF NOT EXISTS us_insurance_carrier text,
  ADD COLUMN IF NOT EXISTS us_insurance_expiration date,
  ADD COLUMN IF NOT EXISTS mx_insurance_policy_number text,
  ADD COLUMN IF NOT EXISTS mx_insurance_carrier text,
  ADD COLUMN IF NOT EXISTS mx_insurance_expiration date,
  ADD COLUMN IF NOT EXISTS title_status text
    CHECK (title_status IN ('owned', 'financed', 'leased') OR title_status IS NULL),
  ADD COLUMN IF NOT EXISTS lien_holder text;

CREATE TABLE IF NOT EXISTS mdata.unit_plates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  country text NOT NULL CHECK (country IN ('US', 'MX')),
  jurisdiction text NOT NULL,
  plate_number text NOT NULL,
  expiration date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_unit_plates_unit_id ON mdata.unit_plates (unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_plates_operating_company ON mdata.unit_plates (operating_company_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unit_plates_active
  ON mdata.unit_plates (unit_id, country, jurisdiction)
  WHERE status = 'active';

ALTER TABLE mdata.unit_plates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unit_plates_company_isolation ON mdata.unit_plates;
CREATE POLICY unit_plates_company_isolation ON mdata.unit_plates
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

ALTER TABLE telematics.vehicle_driver_assignments
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vda_one_default_per_unit
  ON telematics.vehicle_driver_assignments (unit_id)
  WHERE is_default = true AND ended_at IS NULL;

CREATE TABLE IF NOT EXISTS mdata.unit_border_crossings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id) ON DELETE CASCADE,
  driver_id uuid,
  load_id uuid,
  crossing_date timestamptz NOT NULL,
  direction text NOT NULL CHECK (direction IN ('northbound', 'southbound')),
  port_of_entry text NOT NULL,
  manifest_number text,
  ace_emanifest_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ubc_unit_id ON mdata.unit_border_crossings (unit_id);
CREATE INDEX IF NOT EXISTS idx_ubc_crossing_date ON mdata.unit_border_crossings (crossing_date DESC);
CREATE INDEX IF NOT EXISTS idx_ubc_operating_company ON mdata.unit_border_crossings (operating_company_id);

ALTER TABLE mdata.unit_border_crossings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ubc_company_isolation ON mdata.unit_border_crossings;
CREATE POLICY ubc_company_isolation ON mdata.unit_border_crossings
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)::uuid
  );

GRANT SELECT, INSERT, UPDATE ON mdata.unit_plates TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON mdata.unit_border_crossings TO ih35_app;

COMMIT;
