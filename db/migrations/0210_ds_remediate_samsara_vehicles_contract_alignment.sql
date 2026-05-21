BEGIN;

ALTER TABLE integrations.samsara_vehicles
  ADD COLUMN IF NOT EXISTS created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE integrations.samsara_vehicles
SET
  created_at = COALESCE(created_at, last_seen_at, now()),
  updated_at = COALESCE(updated_at, last_seen_at, now()),
  last_seen_at = COALESCE(last_seen_at, created_at, now())
WHERE created_at IS NULL OR updated_at IS NULL OR last_seen_at IS NULL;

ALTER TABLE integrations.samsara_vehicles
  ALTER COLUMN last_seen_at SET NOT NULL,
  ALTER COLUMN last_seen_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS ix_samsara_vehicles_last_seen_at
  ON integrations.samsara_vehicles (operating_company_id, last_seen_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON integrations.samsara_vehicles TO ih35_app;

COMMIT;
