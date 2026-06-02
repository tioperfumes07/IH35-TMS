-- Block 15: Trailer Profile Part 1 — status context, specs, compliance, equipment_plates
BEGIN;

ALTER TYPE mdata.equipment_status ADD VALUE IF NOT EXISTS 'Damaged';
ALTER TYPE mdata.equipment_status ADD VALUE IF NOT EXISTS 'Transferred';

ALTER TABLE mdata.equipment DROP CONSTRAINT IF EXISTS equipment_equipment_type_check;
ALTER TABLE mdata.equipment
  ADD CONSTRAINT equipment_equipment_type_check CHECK (
    equipment_type IN (
      'DryVan', 'Reefer', 'Flatbed', 'Tanker', 'Container', 'Chassis', 'StepDeck', 'Lowboy',
      'Conestoga', 'RGN', 'Other'
    )
  );

ALTER TABLE mdata.equipment
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_change_reason text,
  ADD COLUMN IF NOT EXISTS sold_date date,
  ADD COLUMN IF NOT EXISTS sold_to text,
  ADD COLUMN IF NOT EXISTS sold_price numeric(12, 2),
  ADD COLUMN IF NOT EXISTS transferred_date date,
  ADD COLUMN IF NOT EXISTS transferred_to_entity text
    CHECK (transferred_to_entity IN ('TRK', 'TRANSP', 'USMCA') OR transferred_to_entity IS NULL),
  ADD COLUMN IF NOT EXISTS damage_date date,
  ADD COLUMN IF NOT EXISTS damage_description text,
  ADD COLUMN IF NOT EXISTS oos_date date,
  ADD COLUMN IF NOT EXISTS oos_reason text,
  ADD COLUMN IF NOT EXISTS length_ft integer,
  ADD COLUMN IF NOT EXISTS width_ft numeric,
  ADD COLUMN IF NOT EXISTS height_ft numeric,
  ADD COLUMN IF NOT EXISTS max_payload_lbs integer,
  ADD COLUMN IF NOT EXISTS axle_count integer,
  ADD COLUMN IF NOT EXISTS suspension_type text,
  ADD COLUMN IF NOT EXISTS tire_size text,
  ADD COLUMN IF NOT EXISTS operation_country text
    CHECK (operation_country IN ('US', 'MX', 'cross_border') OR operation_country IS NULL),
  ADD COLUMN IF NOT EXISTS us_insurance_policy_number text,
  ADD COLUMN IF NOT EXISTS us_insurance_expiration date,
  ADD COLUMN IF NOT EXISTS mx_insurance_policy_number text,
  ADD COLUMN IF NOT EXISTS mx_insurance_expiration date,
  ADD COLUMN IF NOT EXISTS dot_inspection_last_date date,
  ADD COLUMN IF NOT EXISTS dot_inspection_next_due date,
  ADD COLUMN IF NOT EXISTS title_status text,
  ADD COLUMN IF NOT EXISTS lien_holder text;

CREATE TABLE IF NOT EXISTS mdata.equipment_plates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  equipment_id uuid NOT NULL REFERENCES mdata.equipment(id) ON DELETE CASCADE,
  country text NOT NULL CHECK (country IN ('US', 'MX')),
  jurisdiction text NOT NULL,
  plate_number text NOT NULL,
  expiration date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'archived')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_eq_plates_equipment_id ON mdata.equipment_plates (equipment_id);
CREATE INDEX IF NOT EXISTS idx_eq_plates_operating_company ON mdata.equipment_plates (operating_company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_eq_plates_active
  ON mdata.equipment_plates (equipment_id, country, jurisdiction)
  WHERE status = 'active';

ALTER TABLE mdata.equipment_plates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipment_plates_company_isolation ON mdata.equipment_plates;
CREATE POLICY equipment_plates_company_isolation ON mdata.equipment_plates
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

GRANT SELECT, INSERT, UPDATE ON mdata.equipment_plates TO ih35_app;

COMMIT;
