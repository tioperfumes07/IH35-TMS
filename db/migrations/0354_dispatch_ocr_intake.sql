-- B21-D7: OCR intake queue — email forward → async OCR → review → convert to load.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.ocr_intake_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  status text NOT NULL DEFAULT 'pending_ocr'
    CHECK (status IN ('pending_ocr', 'processing', 'ready_review', 'failed', 'converted', 'archived')),
  source text NOT NULL DEFAULT 'email_forward'
    CHECK (source IN ('email_forward', 'manual_upload')),
  email_from text NULL,
  email_subject text NULL,
  email_received_at timestamptz NULL,
  source_pdf_r2_key text NOT NULL,
  attachment_filename text NULL,
  extracted_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence_score numeric(5, 4) NULL CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  error_message text NULL,
  converted_load_id uuid NULL REFERENCES mdata.loads(id),
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_intake_queue_company_status
  ON dispatch.ocr_intake_queue (operating_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ocr_intake_queue_r2_key
  ON dispatch.ocr_intake_queue (source_pdf_r2_key);

ALTER TABLE dispatch.ocr_intake_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ocr_intake_queue_company_scope ON dispatch.ocr_intake_queue;
CREATE POLICY ocr_intake_queue_company_scope
  ON dispatch.ocr_intake_queue
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON dispatch.ocr_intake_queue TO ih35_app;

COMMIT;
