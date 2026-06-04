-- Block A24-12: Pre-hire application portal — identity.driver_applicants + applicant_documents
-- NOTE: GO reserved 0351; slots 0351–0362 taken by prior lane work — ships as 0363.

BEGIN;

CREATE TABLE IF NOT EXISTS identity.driver_applicants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  record_kind text NOT NULL DEFAULT 'applicant'
    CHECK (record_kind IN ('portal_config', 'applicant')),
  intake_token text NULL UNIQUE,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'screening', 'interview', 'offer', 'hired', 'declined', 'withdrawn')),
  first_name text NULL,
  last_name text NULL,
  email text NULL,
  phone text NULL,
  date_of_birth date NULL,
  cdl_number text NULL,
  cdl_state text NULL,
  years_experience smallint NULL CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 60),
  application_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  fcra_acknowledged_at timestamptz NULL,
  converted_driver_id uuid NULL REFERENCES mdata.drivers(id) ON DELETE SET NULL,
  onboarding_session_id uuid NULL REFERENCES safety.onboarding_sessions(id) ON DELETE SET NULL,
  reviewed_by_user_id uuid NULL REFERENCES identity.users(id) ON DELETE SET NULL,
  status_notes text NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_applicants_portal_token CHECK (
    (record_kind = 'portal_config' AND intake_token IS NOT NULL)
    OR (record_kind = 'applicant' AND intake_token IS NULL)
  ),
  CONSTRAINT driver_applicants_applicant_identity CHECK (
    record_kind = 'portal_config'
    OR (first_name IS NOT NULL AND last_name IS NOT NULL AND phone IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_applicants_portal_per_company
  ON identity.driver_applicants (operating_company_id)
  WHERE record_kind = 'portal_config' AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_applicants_company_status
  ON identity.driver_applicants (operating_company_id, status)
  WHERE record_kind = 'applicant' AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_applicants_intake_token
  ON identity.driver_applicants (intake_token)
  WHERE intake_token IS NOT NULL AND archived_at IS NULL;

DROP TRIGGER IF EXISTS trg_driver_applicants_touch_updated_at ON identity.driver_applicants;
CREATE TRIGGER trg_driver_applicants_touch_updated_at
  BEFORE UPDATE ON identity.driver_applicants
  FOR EACH ROW EXECUTE FUNCTION safety.touch_updated_at();

ALTER TABLE identity.driver_applicants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_applicants_tenant_scope ON identity.driver_applicants;
CREATE POLICY driver_applicants_tenant_scope
  ON identity.driver_applicants
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

CREATE TABLE IF NOT EXISTS identity.applicant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id uuid NOT NULL REFERENCES identity.driver_applicants(id) ON DELETE CASCADE,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_id uuid NULL,
  file_name text NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_applicant_documents_applicant
  ON identity.applicant_documents (applicant_id)
  WHERE archived_at IS NULL;

ALTER TABLE identity.applicant_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS applicant_documents_tenant_scope ON identity.applicant_documents;
CREATE POLICY applicant_documents_tenant_scope
  ON identity.applicant_documents
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON identity.driver_applicants TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON identity.applicant_documents TO ih35_app;

COMMIT;

-- DOWN (manual rollback):
-- DROP TABLE IF EXISTS identity.applicant_documents;
-- DROP TABLE IF EXISTS identity.driver_applicants;
