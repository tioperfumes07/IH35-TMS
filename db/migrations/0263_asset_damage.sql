BEGIN;

ALTER TABLE mdata.assets
  ADD COLUMN IF NOT EXISTS repair_estimate_cents BIGINT CHECK (repair_estimate_cents IS NULL OR repair_estimate_cents >= 0),
  ADD COLUMN IF NOT EXISTS damage_notes TEXT,
  ADD COLUMN IF NOT EXISTS damage_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS out_of_service BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS mdata.asset_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES org.companies(id),
  asset_id UUID NOT NULL REFERENCES mdata.assets(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID REFERENCES identity.users(id),
  note TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_status_history_tenant_asset
  ON mdata.asset_status_history (tenant_id, asset_id, changed_at DESC);

ALTER TABLE mdata.asset_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.asset_status_history FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS asset_status_history_tenant_scope ON mdata.asset_status_history;
CREATE POLICY asset_status_history_tenant_scope
ON mdata.asset_status_history
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR tenant_id::text = current_setting('app.operating_company_id', true)
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR tenant_id::text = current_setting('app.operating_company_id', true)
);

GRANT SELECT, INSERT ON mdata.asset_status_history TO ih35_app;

COMMIT;
