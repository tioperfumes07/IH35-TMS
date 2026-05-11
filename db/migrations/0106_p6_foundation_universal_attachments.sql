BEGIN;

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

CREATE INDEX IF NOT EXISTS idx_attachments_entity
  ON documents.attachments (operating_company_id, entity_type, entity_id)
  WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_attachments_sha256
  ON documents.attachments (operating_company_id, sha256_hash);

ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'from_load' CHECK (invoice_type IN (
    'from_load','driver_damage','driver_misc','vendor_chargeback',
    'customer_adjustment','manual'
  )),
  ADD COLUMN IF NOT EXISTS bill_to_entity_type text CHECK (bill_to_entity_type IN (
    'customer','driver','vendor','other'
  )),
  ADD COLUMN IF NOT EXISTS bill_to_entity_id uuid,
  ADD COLUMN IF NOT EXISTS auto_deduct_settlement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deducted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deducted_via_settlement_id uuid;

CREATE INDEX IF NOT EXISTS idx_invoices_bill_to
  ON accounting.invoices (operating_company_id, bill_to_entity_type, bill_to_entity_id)
  WHERE bill_to_entity_id IS NOT NULL;

COMMIT;
