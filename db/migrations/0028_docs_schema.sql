BEGIN;

CREATE SCHEMA IF NOT EXISTS docs;
GRANT USAGE ON SCHEMA docs TO ih35_app;

CREATE TABLE IF NOT EXISTS catalogs.file_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  applies_to TEXT[] NOT NULL DEFAULT '{}',
  typical_expiration_months INT,
  requires_expiration_date BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  updated_by_user_id UUID
);

COMMENT ON TABLE catalogs.file_categories IS
  'Document category catalog. Admin-editable. Pre-populated with 20 categories from Master Blueprint MUST 3.8.2. applies_to array indicates which entity types each category is valid for.';

INSERT INTO catalogs.file_categories (code, label, description, applies_to, typical_expiration_months, requires_expiration_date) VALUES
  ('bol', 'Bill of Lading', 'Shipping document confirming pickup', ARRAY['load'], NULL, false),
  ('pod', 'Proof of Delivery', 'Signed delivery confirmation', ARRAY['load'], NULL, false),
  ('rate_confirmation', 'Rate Confirmation', 'Broker-carrier rate agreement for a specific load', ARRAY['load','customer'], NULL, false),
  ('dispatch_instructions', 'Dispatch Instructions', 'Pickup/delivery instructions from broker', ARRAY['load'], NULL, false),
  ('accident_report', 'Accident Report', 'DOT accident reporting documentation', ARRAY['driver','unit','load'], NULL, false),
  ('damage_photo', 'Damage Photo', 'Photo evidence of cargo or equipment damage', ARRAY['load','unit','equipment'], NULL, false),
  ('dvir', 'DVIR (Driver Vehicle Inspection Report)', 'Daily vehicle inspection per FMCSA', ARRAY['unit','driver'], NULL, false),
  ('dot_inspection', 'DOT Inspection Report', 'DOT roadside or annual inspection report', ARRAY['unit','driver'], NULL, false),
  ('antidoping_result', 'Anti-Doping Test Result', 'Drug/alcohol test results', ARRAY['driver'], NULL, false),
  ('medical_card', 'DOT Medical Card', 'Driver DOT medical examiner certificate', ARRAY['driver'], 24, true),
  ('cdl', 'Commercial Driver License (CDL)', 'Driver CDL document', ARRAY['driver'], 48, true),
  ('permit', 'Permit', 'Operating permit (oversize, hazmat, fuel tax, etc.)', ARRAY['unit','equipment','standalone'], 12, true),
  ('insurance_policy', 'Insurance Policy', 'Insurance certificate or policy document', ARRAY['standalone','unit','equipment','customer','vendor'], 12, true),
  ('claim', 'Insurance/Damage Claim', 'Claim filing or correspondence', ARRAY['load','unit','equipment','customer'], NULL, false),
  ('signed_acknowledgment', 'Signed Acknowledgment', 'Driver/employee policy acknowledgment', ARRAY['driver','standalone'], NULL, false),
  ('vendor_invoice', 'Vendor Invoice', 'Invoice from vendor (fuel, repairs, services)', ARRAY['vendor'], NULL, false),
  ('bank_statement', 'Bank Statement', 'Operating or factor bank statement', ARRAY['standalone'], NULL, false),
  ('tax_form', 'Tax Form', 'W-9, 1099, IFTA filings, etc.', ARRAY['driver','customer','vendor','standalone'], NULL, false),
  ('legal_doc', 'Legal Document', 'Contract, agreement, court filing, settlement document', ARRAY['customer','vendor','driver','standalone'], NULL, false),
  ('other', 'Other', 'Catch-all for documents not fitting predefined categories', ARRAY['driver','customer','vendor','unit','equipment','load','settlement','invoice','standalone'], NULL, false)
ON CONFLICT (code) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON catalogs.file_categories TO ih35_app;
ALTER TABLE catalogs.file_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.file_categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_cat_select_authenticated ON catalogs.file_categories;
CREATE POLICY file_cat_select_authenticated ON catalogs.file_categories
  FOR SELECT TO ih35_app
  USING (true);

DROP POLICY IF EXISTS file_cat_modify_owner_admin ON catalogs.file_categories;
CREATE POLICY file_cat_modify_owner_admin ON catalogs.file_categories
  FOR ALL TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator') OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator') OR identity.is_lucia_bypass());

CREATE TABLE IF NOT EXISTS docs.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  sha256_hash TEXT,
  r2_bucket TEXT NOT NULL DEFAULT 'ih35-tms-evidence',
  r2_key TEXT NOT NULL UNIQUE,
  upload_completed_at TIMESTAMPTZ,
  category_id UUID REFERENCES catalogs.file_categories(id),
  document_date DATE,
  expiration_date DATE,
  description TEXT,
  parent_file_id UUID REFERENCES docs.files(id),
  version_number INT NOT NULL DEFAULT 1 CHECK (version_number > 0),
  uploader_user_id UUID NOT NULL REFERENCES identity.users(id),
  upload_ip_address INET,
  upload_user_agent TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES identity.users(id),
  delete_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT delete_consistency_files
    CHECK (
      (deleted_at IS NULL AND deleted_by_user_id IS NULL AND delete_reason IS NULL)
      OR (deleted_at IS NOT NULL AND deleted_by_user_id IS NOT NULL AND delete_reason IS NOT NULL)
    ),
  CONSTRAINT version_consistency
    CHECK (
      (parent_file_id IS NULL AND version_number = 1)
      OR (parent_file_id IS NOT NULL AND version_number > 1)
    )
);

COMMENT ON TABLE docs.files IS 'Master document records. Soft-delete only. Each file has metadata + R2 storage reference. Versioning via parent_file_id chain.';
COMMENT ON COLUMN docs.files.r2_key IS 'Cloudflare R2 object key. Format: org/<operating_company_id>/files/<file_uuid>/<version>/<original_filename>';
COMMENT ON COLUMN docs.files.upload_completed_at IS 'Set after presigned upload confirmed. NULL = upload in progress or failed; ignore these records in queries.';

CREATE INDEX IF NOT EXISTS idx_files_operating_company ON docs.files (operating_company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_category ON docs.files (category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_uploader ON docs.files (uploader_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_parent ON docs.files (parent_file_id) WHERE parent_file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_expiration ON docs.files (expiration_date) WHERE expiration_date IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_pending_upload ON docs.files (created_at) WHERE upload_completed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON docs.files TO ih35_app;
ALTER TABLE docs.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs.files FORCE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS docs.file_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES docs.files(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'driver', 'customer', 'vendor', 'unit', 'equipment',
    'load', 'settlement', 'invoice'
  )),
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES identity.users(id),
  UNIQUE (file_id, entity_type, entity_id, deleted_at)
);

COMMENT ON TABLE docs.file_links IS 'Polymorphic links between files and entities. A file can be linked to multiple entities. Soft-delete preserves history. entity_id NOT enforced via FK because it spans multiple tables; backend enforces existence at link creation.';

CREATE INDEX IF NOT EXISTS idx_file_links_entity ON docs.file_links (entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_links_file ON docs.file_links (file_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_file_links_active ON docs.file_links (file_id, entity_type, entity_id) WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON docs.file_links TO ih35_app;
ALTER TABLE docs.file_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs.file_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS files_select ON docs.files;
CREATE POLICY files_select ON docs.files
  FOR SELECT TO ih35_app
  USING (
    identity.current_user_role() IN ('Owner', 'Administrator')
    OR identity.is_lucia_bypass()
    OR (
      EXISTS (
        SELECT 1
        FROM docs.file_links fl
        JOIN mdata.drivers d ON d.id = fl.entity_id
        WHERE fl.file_id = docs.files.id
          AND fl.deleted_at IS NULL
          AND fl.entity_type = 'driver'
          AND d.identity_user_id = identity.current_user_id()
      )
    )
    OR EXISTS (
      SELECT 1
      FROM docs.file_links fl
      WHERE fl.file_id = docs.files.id
        AND fl.deleted_at IS NULL
        AND fl.entity_type = 'driver'
        AND identity.current_user_role() IN ('Manager', 'Dispatcher', 'Safety')
    )
    OR EXISTS (
      SELECT 1
      FROM docs.file_links fl
      WHERE fl.file_id = docs.files.id
        AND fl.deleted_at IS NULL
        AND fl.entity_type = 'customer'
        AND identity.current_user_role() IN ('Manager', 'Dispatcher', 'Accountant')
    )
    OR EXISTS (
      SELECT 1
      FROM docs.file_links fl
      WHERE fl.file_id = docs.files.id
        AND fl.deleted_at IS NULL
        AND fl.entity_type IN ('vendor', 'unit', 'equipment')
        AND identity.current_user_role() IN ('Manager', 'Dispatcher', 'Accountant', 'Mechanic')
    )
  );

DROP POLICY IF EXISTS files_insert ON docs.files;
CREATE POLICY files_insert ON docs.files
  FOR INSERT TO ih35_app
  WITH CHECK (true);

DROP POLICY IF EXISTS files_update ON docs.files;
CREATE POLICY files_update ON docs.files
  FOR UPDATE TO ih35_app
  USING (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager')
    OR identity.is_lucia_bypass()
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_role() IN ('Owner', 'Administrator')
    OR (
      identity.current_user_role() = 'Manager'
      AND deleted_at IS NULL
      AND deleted_by_user_id IS NULL
      AND delete_reason IS NULL
    )
  );

DROP POLICY IF EXISTS file_links_select ON docs.file_links;
CREATE POLICY file_links_select ON docs.file_links
  FOR SELECT TO ih35_app
  USING (true);

DROP POLICY IF EXISTS file_links_insert ON docs.file_links;
CREATE POLICY file_links_insert ON docs.file_links
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher', 'Safety', 'Accountant')
    OR identity.is_lucia_bypass()
  );

DROP POLICY IF EXISTS file_links_update ON docs.file_links;
CREATE POLICY file_links_update ON docs.file_links
  FOR UPDATE TO ih35_app
  USING (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager') OR identity.is_lucia_bypass())
  WITH CHECK (identity.current_user_role() IN ('Owner', 'Administrator', 'Manager') OR identity.is_lucia_bypass());

COMMIT;
