BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.fmcsa_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  lookup_type TEXT NOT NULL CHECK (lookup_type IN ('usdot', 'mc')),
  lookup_value TEXT NOT NULL,
  legal_name TEXT,
  dba_name TEXT,
  usdot_number TEXT,
  mc_number TEXT,
  address_line1 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  authority_status TEXT,
  insurance_status TEXT,
  safety_rating TEXT,
  raw_response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cached_until TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id)
);

CREATE INDEX IF NOT EXISTS idx_fmcsa_lookups_value ON catalogs.fmcsa_lookups (lookup_type, lookup_value);
CREATE INDEX IF NOT EXISTS idx_fmcsa_lookups_cached ON catalogs.fmcsa_lookups (cached_until, lookup_type, lookup_value);
CREATE INDEX IF NOT EXISTS idx_fmcsa_lookups_company ON catalogs.fmcsa_lookups (operating_company_id);

ALTER TABLE catalogs.fmcsa_lookups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fmcsa_lookups_select ON catalogs.fmcsa_lookups;
CREATE POLICY fmcsa_lookups_select ON catalogs.fmcsa_lookups
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id FROM org.user_company_access
      WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS fmcsa_lookups_insert ON catalogs.fmcsa_lookups;
CREATE POLICY fmcsa_lookups_insert ON catalogs.fmcsa_lookups
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() = ANY (
      ARRAY[
        'Owner'::identity.role_enum,
        'Administrator'::identity.role_enum,
        'Manager'::identity.role_enum,
        'Dispatcher'::identity.role_enum,
        'Safety'::identity.role_enum,
        'Accountant'::identity.role_enum
      ]
    )
  );

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT ON catalogs.fmcsa_lookups TO ih35_app;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS fmcsa_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fmcsa_lookup_id UUID REFERENCES catalogs.fmcsa_lookups(id),
  ADD COLUMN IF NOT EXISTS fmcsa_authority_status_at_verification TEXT;

COMMIT;
