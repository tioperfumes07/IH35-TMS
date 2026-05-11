BEGIN;
ALTER TABLE qbo_archive.import_batches
  ADD COLUMN IF NOT EXISTS last_error_message text;
COMMIT;
