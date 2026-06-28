-- CLOSURE-6 P5-T14 — team split commission configs + load overrides (additive).
BEGIN;

CREATE SCHEMA IF NOT EXISTS settlements;

CREATE TABLE IF NOT EXISTS settlements.team_split_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  primary_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  secondary_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  split_type text NOT NULL DEFAULT 'percentage' CHECK (split_type IN ('percentage', 'fixed', 'mileage')),
  primary_ratio numeric(5,4) NOT NULL CHECK (primary_ratio > 0 AND primary_ratio <= 1),
  secondary_ratio numeric(5,4) NOT NULL CHECK (secondary_ratio > 0 AND secondary_ratio <= 1),
  effective_from_date date NOT NULL DEFAULT CURRENT_DATE,
  effective_to_date date,
  created_by_user_id uuid REFERENCES identity.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_split_configs_drivers_distinct CHECK (primary_driver_id <> secondary_driver_id),
  CONSTRAINT team_split_configs_ratio_sum_chk CHECK (ABS((primary_ratio + secondary_ratio) - 1) < 0.0001)
);

CREATE INDEX IF NOT EXISTS ix_team_split_configs_company_primary
  ON settlements.team_split_configs (operating_company_id, primary_driver_id, status);

CREATE INDEX IF NOT EXISTS ix_team_split_configs_company_secondary
  ON settlements.team_split_configs (operating_company_id, secondary_driver_id, status);

CREATE TABLE IF NOT EXISTS settlements.team_split_load_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id),
  primary_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  secondary_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  primary_ratio numeric(5,4) NOT NULL CHECK (primary_ratio > 0 AND primary_ratio <= 1),
  secondary_ratio numeric(5,4) NOT NULL CHECK (secondary_ratio > 0 AND secondary_ratio <= 1),
  reason text NOT NULL DEFAULT 'one_off_team' CHECK (reason IN ('one_off_team', 'config_override')),
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_split_load_overrides_drivers_distinct CHECK (primary_driver_id <> secondary_driver_id),
  CONSTRAINT team_split_load_overrides_ratio_sum_chk CHECK (ABS((primary_ratio + secondary_ratio) - 1) < 0.0001),
  CONSTRAINT team_split_load_overrides_load_unique UNIQUE (load_id)
);

CREATE INDEX IF NOT EXISTS ix_team_split_load_overrides_company_load
  ON settlements.team_split_load_overrides (operating_company_id, load_id);

ALTER TABLE settlements.team_split_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements.team_split_load_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_split_configs_tenant_scope ON settlements.team_split_configs;
CREATE POLICY team_split_configs_tenant_scope ON settlements.team_split_configs
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

DROP POLICY IF EXISTS team_split_load_overrides_tenant_scope ON settlements.team_split_load_overrides;
CREATE POLICY team_split_load_overrides_tenant_scope ON settlements.team_split_load_overrides
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON settlements.team_split_configs TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON settlements.team_split_load_overrides TO ih35_app;

ALTER TABLE payroll.driver_settlement_line_items
  ADD COLUMN IF NOT EXISTS split_partner_driver_id uuid NULL REFERENCES mdata.drivers(id);

COMMIT;
