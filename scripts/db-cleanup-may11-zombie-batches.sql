-- One-time cleanup of zombie forensic batches from May 10
-- Run AFTER P6-FOUNDATION deploy is live
-- Marks 2 known zombie batches as failed with audit trail

BEGIN;

UPDATE qbo_archive.import_batches
SET status = 'failed',
    completed_at = NOW(),
    errors_count = errors_count + 1,
    last_error_message = COALESCE(last_error_message, '')
                       || ' [manual cleanup: worker never picked up job - pre-runner-bootstrap zombie]'
WHERE id IN (
  '1d0b0244-dda9-45ef-9798-5b6107790a47',  -- TRK batch May 10 12:52 PM CT
  '1d91607a-40f0-4947-a5d4-728dcc095fec'   -- TRANSP batch May 10 7:48 PM CT
)
AND status = 'in_progress';

-- Verify
SELECT id, status, completed_at, errors_count
FROM qbo_archive.import_batches
WHERE id IN (
  '1d0b0244-dda9-45ef-9798-5b6107790a47',
  '1d91607a-40f0-4947-a5d4-728dcc095fec'
);

COMMIT;
