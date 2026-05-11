BEGIN;

DO $$
BEGIN
  IF to_regclass('docs.files') IS NULL THEN
    RAISE NOTICE 'Skipping 0113: docs.files table not present';
    RETURN;
  END IF;

  ALTER TABLE docs.files
    ADD COLUMN IF NOT EXISTS dispatch_load_id uuid REFERENCES mdata.loads(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dispatch_document_channel text
      CHECK (dispatch_document_channel IS NULL OR dispatch_document_channel IN ('portal', 'sms', 'whatsapp', 'email')),
    ADD COLUMN IF NOT EXISTS dispatch_delivery_status text NOT NULL DEFAULT 'pending'
      CHECK (dispatch_delivery_status IN ('pending', 'sent', 'delivered', 'failed')),
    ADD COLUMN IF NOT EXISTS dispatch_external_message_id text,
    ADD COLUMN IF NOT EXISTS dispatch_generated_at timestamptz;
END $$;

CREATE INDEX IF NOT EXISTS idx_docs_files_dispatch_load
  ON docs.files (dispatch_load_id, created_at DESC)
  WHERE dispatch_load_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_docs_files_dispatch_channel_status
  ON docs.files (dispatch_document_channel, dispatch_delivery_status)
  WHERE dispatch_document_channel IS NOT NULL;

COMMIT;
