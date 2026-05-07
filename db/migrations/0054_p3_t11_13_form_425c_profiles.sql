BEGIN;

CREATE TABLE IF NOT EXISTS catalogs.form_425c_company_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  company_key text NOT NULL CHECK (company_key IN ('trucking', 'transportation')),
  company_name text NOT NULL,
  case_number text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT 'Texas',
  division text NOT NULL DEFAULT 'San Antonio',
  judge text NOT NULL DEFAULT '',
  ein text NOT NULL DEFAULT '',
  filing_address text NOT NULL DEFAULT '',
  line_of_business text NOT NULL DEFAULT '',
  naisc_code text NOT NULL DEFAULT '',
  default_questionnaire_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  last_updated_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, company_key)
);

CREATE INDEX IF NOT EXISTS idx_form_425c_profiles_company_key
  ON catalogs.form_425c_company_profiles (operating_company_id, company_key);

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.form_425c_company_profiles TO ih35_app;

ALTER TABLE catalogs.form_425c_company_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_form_425c_profiles ON catalogs.form_425c_company_profiles;
CREATE POLICY rls_form_425c_profiles ON catalogs.form_425c_company_profiles
  FOR ALL TO ih35_app
  USING (operating_company_id = current_setting('app.operating_company_id')::uuid)
  WITH CHECK (operating_company_id = current_setting('app.operating_company_id')::uuid);

DROP TRIGGER IF EXISTS trg_form_425c_profiles_updated_at ON catalogs.form_425c_company_profiles;
CREATE TRIGGER trg_form_425c_profiles_updated_at
  BEFORE UPDATE ON catalogs.form_425c_company_profiles
  FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

COMMIT;

