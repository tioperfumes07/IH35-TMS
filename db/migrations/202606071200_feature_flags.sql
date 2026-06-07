-- GAP-92: per-tenant + per-user feature flag system (additive).
BEGIN;

CREATE SCHEMA IF NOT EXISTS lib;
GRANT USAGE ON SCHEMA lib TO ih35_app;

CREATE TABLE IF NOT EXISTS lib.feature_flags (
  flag_key TEXT PRIMARY KEY,
  description TEXT,
  default_enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (rollout_pct >= 0 AND rollout_pct <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lib.feature_flag_overrides (
  uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key TEXT NOT NULL REFERENCES lib.feature_flags(flag_key) ON DELETE CASCADE,
  operating_company_id UUID REFERENCES org.companies(id),
  user_uuid UUID REFERENCES identity.users(id),
  enabled BOOLEAN NOT NULL,
  set_by_user_uuid UUID NOT NULL REFERENCES identity.users(id),
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  CHECK (operating_company_id IS NOT NULL OR user_uuid IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ff_override_oci
  ON lib.feature_flag_overrides(flag_key, operating_company_id)
  WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ff_override_user
  ON lib.feature_flag_overrides(flag_key, user_uuid)
  WHERE user_uuid IS NOT NULL;

ALTER TABLE lib.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE lib.feature_flag_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flags_select ON lib.feature_flags;
CREATE POLICY feature_flags_select ON lib.feature_flags
  FOR SELECT TO ih35_app
  USING (true);

DROP POLICY IF EXISTS feature_flags_admin ON lib.feature_flags;
CREATE POLICY feature_flags_admin ON lib.feature_flags
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

DROP POLICY IF EXISTS ff_overrides_select ON lib.feature_flag_overrides;
CREATE POLICY ff_overrides_select ON lib.feature_flag_overrides
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR user_uuid IS NOT NULL
    OR operating_company_id IS NULL
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS ff_overrides_admin ON lib.feature_flag_overrides;
CREATE POLICY ff_overrides_admin ON lib.feature_flag_overrides
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass())
  WITH CHECK (identity.is_lucia_bypass());

GRANT SELECT ON lib.feature_flags, lib.feature_flag_overrides TO ih35_app;

COMMIT;
