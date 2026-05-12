BEGIN;

CREATE SCHEMA IF NOT EXISTS legal;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'legal'
      AND t.typname = 'contract_template_status'
  ) THEN
    CREATE TYPE legal.contract_template_status AS ENUM (
      'draft',
      'pending_review',
      'approved',
      'active',
      'retired'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'legal'
      AND t.typname = 'contract_instance_status'
  ) THEN
    CREATE TYPE legal.contract_instance_status AS ENUM (
      'draft',
      'sent',
      'viewed',
      'signed_electronically',
      'voided',
      'expired'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS legal.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  template_code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  display_name_en text NOT NULL,
  display_name_es text NOT NULL,
  category text NOT NULL,
  content_html_en text NOT NULL,
  content_html_es text NOT NULL,
  variable_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_witness boolean NOT NULL DEFAULT false,
  status legal.contract_template_status NOT NULL DEFAULT 'draft',
  submitted_for_review_at timestamptz,
  attorney_approved_by text,
  attorney_bar_number text,
  attorney_approved_at timestamptz,
  attorney_notes text,
  activated_at timestamptz,
  retired_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, template_code, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_contract_templates_active_code
  ON legal.contract_templates (operating_company_id, template_code)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_legal_contract_templates_status
  ON legal.contract_templates (operating_company_id, status, category, created_at DESC);

CREATE TABLE IF NOT EXISTS legal.contract_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  template_id uuid NOT NULL REFERENCES legal.contract_templates(id),
  template_code text NOT NULL,
  template_version integer NOT NULL,
  signer_type text NOT NULL CHECK (signer_type IN ('driver', 'employee', 'customer', 'vendor', 'other')),
  signer_entity_id uuid,
  signer_name text NOT NULL,
  signer_email text,
  signer_phone text,
  language text NOT NULL CHECK (language IN ('en', 'es', 'bilingual')),
  filled_variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  status legal.contract_instance_status NOT NULL DEFAULT 'draft',
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  signed_pdf_attachment_id uuid REFERENCES documents.attachments(id),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_contract_instances_lookup
  ON legal.contract_instances (operating_company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_contract_instances_template
  ON legal.contract_instances (operating_company_id, template_code, template_version);

CREATE TABLE IF NOT EXISTS legal.signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contract_instance_id uuid NOT NULL REFERENCES legal.contract_instances(id),
  signed_by_name text NOT NULL,
  typed_signature text NOT NULL,
  drawn_signature_svg text NOT NULL,
  signer_language text NOT NULL CHECK (signer_language IN ('en', 'es', 'bilingual')),
  signer_ip inet,
  signer_user_agent text,
  verification_method text,
  verification_reference text,
  signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_signatures_instance
  ON legal.signatures (operating_company_id, contract_instance_id, signed_at DESC);

CREATE TABLE IF NOT EXISTS legal.contract_audit_log (
  id bigserial PRIMARY KEY,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contract_template_id uuid REFERENCES legal.contract_templates(id),
  contract_instance_id uuid REFERENCES legal.contract_instances(id),
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES identity.users(id),
  actor_name text,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_contract_audit_log_company_time
  ON legal.contract_audit_log (operating_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_contract_audit_log_instance
  ON legal.contract_audit_log (operating_company_id, contract_instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_contract_audit_log_template
  ON legal.contract_audit_log (operating_company_id, contract_template_id, created_at DESC);

CREATE TABLE IF NOT EXISTS legal.contract_signing_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  contract_instance_id uuid NOT NULL REFERENCES legal.contract_instances(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_ip inet,
  consumed_user_agent text,
  verification_channel text NOT NULL DEFAULT 'none' CHECK (verification_channel IN ('none', 'sms', 'email')),
  verification_target text,
  verification_code_hash text,
  verification_code_expires_at timestamptz,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_contract_signing_tokens_lookup
  ON legal.contract_signing_tokens (operating_company_id, contract_instance_id, expires_at DESC);

CREATE OR REPLACE FUNCTION legal.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_legal_contract_templates_set_updated_at ON legal.contract_templates;
CREATE TRIGGER trg_legal_contract_templates_set_updated_at
BEFORE UPDATE ON legal.contract_templates
FOR EACH ROW
EXECUTE FUNCTION legal.set_updated_at();

DROP TRIGGER IF EXISTS trg_legal_contract_instances_set_updated_at ON legal.contract_instances;
CREATE TRIGGER trg_legal_contract_instances_set_updated_at
BEFORE UPDATE ON legal.contract_instances
FOR EACH ROW
EXECUTE FUNCTION legal.set_updated_at();

ALTER TABLE legal.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.contract_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.contract_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.contract_signing_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_legal_contract_templates_isolation ON legal.contract_templates;
CREATE POLICY rls_legal_contract_templates_isolation ON legal.contract_templates
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_legal_contract_instances_isolation ON legal.contract_instances;
CREATE POLICY rls_legal_contract_instances_isolation ON legal.contract_instances
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_legal_signatures_isolation ON legal.signatures;
CREATE POLICY rls_legal_signatures_isolation ON legal.signatures
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_legal_contract_audit_log_isolation ON legal.contract_audit_log;
CREATE POLICY rls_legal_contract_audit_log_isolation ON legal.contract_audit_log
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_legal_contract_signing_tokens_isolation ON legal.contract_signing_tokens;
CREATE POLICY rls_legal_contract_signing_tokens_isolation ON legal.contract_signing_tokens
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

CREATE OR REPLACE FUNCTION legal.block_contract_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'legal.contract_audit_log is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_contract_audit_log_update ON legal.contract_audit_log;
CREATE TRIGGER trg_block_contract_audit_log_update
BEFORE UPDATE ON legal.contract_audit_log
FOR EACH ROW
EXECUTE FUNCTION legal.block_contract_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_block_contract_audit_log_delete ON legal.contract_audit_log;
CREATE TRIGGER trg_block_contract_audit_log_delete
BEFORE DELETE ON legal.contract_audit_log
FOR EACH ROW
EXECUTE FUNCTION legal.block_contract_audit_log_mutation();

REVOKE UPDATE, DELETE ON legal.contract_audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON legal.contract_audit_log FROM ih35_app;

GRANT USAGE ON SCHEMA legal TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA legal TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA legal TO ih35_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA legal
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA legal
  GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

COMMIT;
