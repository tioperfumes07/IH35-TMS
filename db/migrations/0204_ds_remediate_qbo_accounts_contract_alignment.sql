BEGIN;

ALTER TABLE mdata.qbo_accounts
  ADD COLUMN IF NOT EXISTS raw_payload jsonb GENERATED ALWAYS AS (payload_json) STORED,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz GENERATED ALWAYS AS (mirrored_at) STORED,
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE mdata.qbo_accounts
SET
  created_at = COALESCE(created_at, mirrored_at, now()),
  updated_at = COALESCE(updated_at, mirrored_at, now())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE mdata.qbo_accounts
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_qbo_accounts_last_seen_at
  ON mdata.qbo_accounts (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_accounts TO ih35_app;

COMMIT;
