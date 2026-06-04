-- B21-D10: POD capture + BOL generation workflow.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.pod_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES mdata.load_stops(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  photo_r2_key text NULL,
  signature_r2_key text NULL,
  recipient_name text NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected')),
  reviewed_by_user_id uuid NULL REFERENCES identity.users(id),
  reviewed_at timestamptz NULL,
  review_notes text NULL,
  docs_attachment_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS dispatch.bol_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  pdf_r2_key text NOT NULL,
  sha256 text NULL,
  generated_by_user_id uuid NULL REFERENCES identity.users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  docs_attachment_id uuid NULL,
  template_version text NOT NULL DEFAULT 'B21-D10-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_pod_documents_company_status
  ON dispatch.pod_documents (operating_company_id, status, created_at DESC)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pod_documents_load
  ON dispatch.pod_documents (load_id, created_at DESC)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pod_documents_active_stop
  ON dispatch.pod_documents (operating_company_id, stop_id)
  WHERE archived_at IS NULL AND status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_bol_documents_load
  ON dispatch.bol_documents (load_id, generated_at DESC)
  WHERE archived_at IS NULL;

ALTER TABLE dispatch.pod_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.bol_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pod_documents_company_scope ON dispatch.pod_documents;
CREATE POLICY pod_documents_company_scope
  ON dispatch.pod_documents
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS bol_documents_company_scope ON dispatch.bol_documents;
CREATE POLICY bol_documents_company_scope
  ON dispatch.bol_documents
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON dispatch.pod_documents TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.bol_documents TO ih35_app;

COMMIT;
