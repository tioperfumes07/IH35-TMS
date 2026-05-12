BEGIN;

-- Ensure legacy attachments schema/table exist for runtime compatibility.
CREATE SCHEMA IF NOT EXISTS documents;

CREATE TABLE IF NOT EXISTS documents.attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  entity_type text NOT NULL CHECK (entity_type IN (
    'load','work_order','bill','expense','invoice','payment',
    'estimate','driver_charge','vendor_chargeback','customer_adjustment',
    'damage_report','severe_repair','dispute','transfer','journal_entry',
    'driver','customer','vendor','unit','equipment','manual'
  )),
  entity_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN (
    'bol','pod','rate_confirmation','dispatch_instructions','accident_report',
    'damage_photo','dvir','dot_inspection','antidoping_result','medical_card',
    'cdl','permit','insurance_policy','claim','signed_acknowledgment',
    'vendor_invoice','bank_statement','tax_form','legal_doc','check_image',
    'ach_confirmation','wire_confirmation','deposit_slip','vendor_estimate',
    'vendor_ro','receipt','other'
  )),
  filename text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  sha256_hash text NOT NULL,
  r2_object_key text NOT NULL,
  r2_bucket text NOT NULL DEFAULT 'ih35-tms-evidence',
  uploaded_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  deleted_by_user_id uuid REFERENCES identity.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, sha256_hash, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_attachments_entity
  ON documents.attachments (operating_company_id, entity_type, entity_id)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_attachments_sha256
  ON documents.attachments (operating_company_id, sha256_hash);

ALTER TABLE documents.attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_attachments_isolation ON documents.attachments;
CREATE POLICY rls_attachments_isolation ON documents.attachments
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

-- Reconcile runtime grants for maintenance + documents schemas.
GRANT USAGE ON SCHEMA maintenance TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA maintenance TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA maintenance TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA maintenance
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA maintenance
  GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

GRANT USAGE ON SCHEMA documents TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA documents TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA documents TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA documents
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA documents
  GRANT USAGE, SELECT ON SEQUENCES TO ih35_app;

COMMIT;
