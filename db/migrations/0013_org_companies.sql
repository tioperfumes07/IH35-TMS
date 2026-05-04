BEGIN;

CREATE SCHEMA IF NOT EXISTS org;
GRANT USAGE ON SCHEMA org TO ih35_app;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'company_type'
      AND n.nspname = 'org'
  ) THEN
    CREATE TYPE org.company_type AS ENUM ('asset_holder', 'operating_carrier');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS org.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  legal_name text NOT NULL,
  short_name text,
  company_type org.company_type NOT NULL,
  tax_id text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text DEFAULT 'US',
  phone text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid,
  updated_by_user_id uuid
);

CREATE INDEX IF NOT EXISTS idx_org_companies_code ON org.companies (code);
CREATE INDEX IF NOT EXISTS idx_org_companies_type_active
  ON org.companies (company_type, is_active)
  WHERE deactivated_at IS NULL;

COMMENT ON TABLE org.companies IS 'Legal entities operating in the system. Asset holders (IH 35 Trucking) lease assets to operating carriers (IH 35 Transportation, USMCA Freight Solutions).';
COMMENT ON COLUMN org.companies.code IS 'Short slug used internally and in URLs. e.g., TRK, TRANSP, USMCA. Stable identifier.';
COMMENT ON COLUMN org.companies.is_active IS 'When false, company is not selectable in UI even if user has access. Used to hide pre-launch entities like USMCA before July 2026.';

GRANT SELECT, INSERT, UPDATE ON org.companies TO ih35_app;
ALTER TABLE org.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE org.companies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_select_all ON org.companies;
CREATE POLICY company_select_all ON org.companies
FOR SELECT TO ih35_app
USING (true);

DROP POLICY IF EXISTS company_insert_owner ON org.companies;
CREATE POLICY company_insert_owner ON org.companies
FOR INSERT TO ih35_app
WITH CHECK (identity.current_user_role() = 'Owner');

DROP POLICY IF EXISTS company_update_owner ON org.companies;
CREATE POLICY company_update_owner ON org.companies
FOR UPDATE TO ih35_app
USING (identity.current_user_role() = 'Owner')
WITH CHECK (identity.current_user_role() = 'Owner');

DROP POLICY IF EXISTS company_lucia_bypass ON org.companies;
CREATE POLICY company_lucia_bypass ON org.companies
FOR ALL TO ih35_app
USING (identity.is_lucia_bypass())
WITH CHECK (identity.is_lucia_bypass());

INSERT INTO org.companies (code, legal_name, short_name, company_type, country, is_active)
VALUES
  ('TRK', 'IH 35 Trucking LLC', 'IH 35 Trucking', 'asset_holder', 'US', true),
  ('TRANSP', 'IH 35 Transportation LLC', 'IH 35 Transportation', 'operating_carrier', 'US', true),
  ('USMCA', 'USMCA Freight Solutions Inc', 'USMCA Freight', 'operating_carrier', 'US', false)
ON CONFLICT (code) DO NOTHING;

COMMIT;
