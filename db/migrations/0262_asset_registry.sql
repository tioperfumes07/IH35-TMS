BEGIN;

CREATE TABLE IF NOT EXISTS mdata.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  unit_code TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (
    asset_type IN ('tractor', 'dry_van', 'reefer', 'flatbed', 'personnel_vehicle', 'other')
  ),
  vin TEXT,
  make TEXT,
  model TEXT,
  year INT CHECK (year IS NULL OR (year >= 1980 AND year <= 2100)),
  acquisition_cost_cents BIGINT CHECK (acquisition_cost_cents IS NULL OR acquisition_cost_cents >= 0),
  insured_value_cents BIGINT CHECK (insured_value_cents IS NULL OR insured_value_cents >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'damaged', 'idle', 'in_repair', 'sold', 'retired')
  ),
  samsara_unit_id TEXT,
  owning_entity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, unit_code)
);

CREATE INDEX IF NOT EXISTS idx_assets_tenant_status ON mdata.assets (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_tenant_type ON mdata.assets (tenant_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_assets_samsara_unit_id ON mdata.assets (samsara_unit_id);

INSERT INTO mdata.assets (
  tenant_id,
  unit_code,
  asset_type,
  vin,
  make,
  model,
  year,
  status,
  samsara_unit_id,
  owning_entity
)
SELECT
  COALESCE(u.currently_leased_to_company_id, u.owner_company_id) AS tenant_id,
  u.unit_number AS unit_code,
  CASE
    WHEN lower(COALESCE(u.unit_number, '')) ~ '^(t|trk|tractor)' THEN 'tractor'
    WHEN lower(COALESCE(u.unit_number, '')) ~ '(reefer|rf)' THEN 'reefer'
    WHEN lower(COALESCE(u.unit_number, '')) ~ '(flatbed|fb)' THEN 'flatbed'
    WHEN lower(COALESCE(u.unit_number, '')) ~ '(van|wabash|utility|trailer|dry)' THEN 'dry_van'
    ELSE 'other'
  END AS asset_type,
  u.vin,
  u.make,
  u.model,
  u.year,
  CASE
    WHEN u.status = 'InService' THEN 'active'
    WHEN u.status = 'InMaintenance' THEN 'in_repair'
    WHEN u.status = 'OutOfService' THEN 'idle'
    WHEN u.status = 'Sold' THEN 'sold'
    WHEN u.status = 'Totaled' THEN 'retired'
    ELSE 'active'
  END AS status,
  u.samsara_vehicle_id AS samsara_unit_id,
  owner_company.code AS owning_entity
FROM mdata.units u
LEFT JOIN org.companies owner_company ON owner_company.id = u.owner_company_id
WHERE COALESCE(u.currently_leased_to_company_id, u.owner_company_id) IS NOT NULL
ON CONFLICT (tenant_id, unit_code)
DO UPDATE SET
  asset_type = EXCLUDED.asset_type,
  vin = EXCLUDED.vin,
  make = EXCLUDED.make,
  model = EXCLUDED.model,
  year = EXCLUDED.year,
  status = EXCLUDED.status,
  samsara_unit_id = EXCLUDED.samsara_unit_id,
  owning_entity = EXCLUDED.owning_entity,
  updated_at = NOW();

ALTER TABLE mdata.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.assets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assets_tenant_scope ON mdata.assets;
CREATE POLICY assets_tenant_scope
ON mdata.assets
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR tenant_id::text = current_setting('app.operating_company_id', true)
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR tenant_id::text = current_setting('app.operating_company_id', true)
);

DROP TRIGGER IF EXISTS trg_assets_updated_at ON mdata.assets;
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON mdata.assets
  FOR EACH ROW
  EXECUTE FUNCTION identity.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON mdata.assets TO ih35_app;

COMMIT;
