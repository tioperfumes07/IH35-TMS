BEGIN;

-- Pre-delete forensic count captured from production (2026-05-22): 3636 rows.
-- Query:
-- SELECT COUNT(*) AS pre_delete_count
-- FROM outbox.events
-- WHERE event_type IN (
--   'qbo.mdata.item.synced',
--   'qbo.mdata.vendor.synced',
--   'qbo.mdata.customer.synced',
--   'qbo.mdata.account.synced',
--   'email.queued'
-- )
--   AND failed_at IS NOT NULL
--   AND delivered_at IS NULL;

DELETE FROM outbox.events
WHERE event_type IN (
  'qbo.mdata.item.synced',
  'qbo.mdata.vendor.synced',
  'qbo.mdata.customer.synced',
  'qbo.mdata.account.synced',
  'email.queued'
)
  AND failed_at IS NOT NULL
  AND delivered_at IS NULL;

COMMIT;
