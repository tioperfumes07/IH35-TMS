-- Block A24-10: driver communication center — read receipts + delivery tracking on existing messages table
BEGIN;

ALTER TABLE mdata.driver_profile_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_by uuid REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS delivery_ref text;

CREATE INDEX IF NOT EXISTS idx_driver_profile_messages_unread
  ON mdata.driver_profile_messages (operating_company_id, driver_id)
  WHERE read_at IS NULL;

GRANT UPDATE ON mdata.driver_profile_messages TO ih35_app;

COMMIT;
