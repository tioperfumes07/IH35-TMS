BEGIN;

CREATE TABLE IF NOT EXISTS insurance.type_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_insurance_type_catalog_tenant_active
  ON insurance.type_catalog (tenant_id, active, sort_order, name);
CREATE INDEX IF NOT EXISTS idx_insurance_type_catalog_tenant_code
  ON insurance.type_catalog (tenant_id, code);

ALTER TABLE insurance.type_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance.type_catalog FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insurance_type_catalog_tenant_scope ON insurance.type_catalog;
CREATE POLICY insurance_type_catalog_tenant_scope
  ON insurance.type_catalog
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR tenant_id::text = current_setting('app.operating_company_id', true)
  );

DROP TRIGGER IF EXISTS trg_insurance_type_catalog_updated_at ON insurance.type_catalog;
CREATE TRIGGER trg_insurance_type_catalog_updated_at
  BEFORE UPDATE ON insurance.type_catalog
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.type_catalog TO ih35_app;

INSERT INTO insurance.type_catalog (tenant_id, code, name, description, active, sort_order)
SELECT
  c.id AS tenant_id,
  t.code,
  t.name,
  t.description,
  true,
  t.sort_order
FROM (
  SELECT id
  FROM org.companies
  WHERE deactivated_at IS NULL
) AS c
CROSS JOIN (
  VALUES
    ('auto_liability', 'Auto Liability', 'Primary liability coverage for tractors and power units', 10),
    ('physical_damage', 'Physical Damage', 'Collision and comprehensive physical damage coverage', 20),
    ('cargo', 'Cargo', 'Motor truck cargo coverage for freight in transit', 30),
    ('general_liability', 'General Liability', 'General liability coverage for business operations', 40),
    ('workers_comp', 'Workers Compensation', 'Statutory workers compensation coverage', 50),
    ('trailer_interchange', 'Trailer Interchange', 'Coverage for non-owned trailers under interchange agreements', 60),
    ('bobtail', 'Bobtail', 'Coverage while operating tractor without trailer', 70),
    ('non_trucking_liability', 'Non-Trucking Liability', 'Liability coverage during non-business use', 80),
    ('umbrella', 'Umbrella', 'Umbrella liability excess over primary policies', 90),
    ('excess_liability', 'Excess Liability', 'Excess liability layer beyond scheduled limits', 100),
    ('occupational_accident', 'Occupational Accident', 'Occupational accident coverage for owner-operators', 110),
    ('garage_keepers', 'Garage Keepers', 'Garage keepers legal liability coverage', 120),
    ('reefer_breakdown', 'Reefer Breakdown', 'Refrigeration unit breakdown and temperature loss coverage', 130),
    ('pollution', 'Pollution Liability', 'Sudden and accidental pollution liability coverage', 140),
    ('cyber_liability', 'Cyber Liability', 'Cyber incident and data breach response coverage', 150)
) AS t(code, name, description, sort_order)
ON CONFLICT (tenant_id, code) DO NOTHING;

ALTER TABLE insurance.policy
  ADD COLUMN IF NOT EXISTS coverage_type_id UUID REFERENCES insurance.type_catalog(id);

CREATE INDEX IF NOT EXISTS idx_insurance_policy_tenant_coverage_type_id
  ON insurance.policy (tenant_id, coverage_type_id);

UPDATE insurance.policy AS p
SET coverage_type_id = tc.id
FROM insurance.type_catalog AS tc
WHERE p.coverage_type_id IS NULL
  AND tc.tenant_id = p.tenant_id
  AND tc.code = p.coverage_type;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM insurance.policy WHERE coverage_type_id IS NULL) THEN
    RAISE EXCEPTION 'insurance.policy coverage_type_id backfill incomplete';
  END IF;
END
$$;

ALTER TABLE insurance.policy
  ALTER COLUMN coverage_type_id SET NOT NULL;

ALTER TABLE insurance.policy DROP CONSTRAINT IF EXISTS policy_coverage_type_check;
ALTER TABLE insurance.policy
  ADD CONSTRAINT policy_coverage_type_check CHECK (
    coverage_type IN (
      'auto_liability',
      'physical_damage',
      'cargo',
      'general_liability',
      'workers_comp',
      'trailer_interchange',
      'bobtail',
      'non_trucking_liability',
      'umbrella',
      'excess_liability',
      'occupational_accident',
      'garage_keepers',
      'reefer_breakdown',
      'pollution',
      'cyber_liability'
    )
  );

COMMIT;
