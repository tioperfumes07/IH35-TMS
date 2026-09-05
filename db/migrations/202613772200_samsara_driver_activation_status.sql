BEGIN;

-- TEL-39 Samsara driver mirror completeness.
-- deactivated_at is not appropriate here: this raw integration mirror records Samsara's
-- source activation state; no IH35 master driver is deactivated by this migration.
ALTER TABLE integrations.samsara_drivers
  ADD COLUMN IF NOT EXISTS driver_activation_status text;

UPDATE integrations.samsara_drivers
   SET driver_activation_status = lower(COALESCE(
     NULLIF(raw_payload->>'driverActivationStatus', ''),
     NULLIF(raw_payload->>'driver_activation_status', ''),
     'active'
   ))
 WHERE driver_activation_status IS NULL;

ALTER TABLE integrations.samsara_drivers
  ALTER COLUMN driver_activation_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'samsara_drivers_activation_status_check'
       AND conrelid = 'integrations.samsara_drivers'::regclass
  ) THEN
    ALTER TABLE integrations.samsara_drivers
      ADD CONSTRAINT samsara_drivers_activation_status_check
      CHECK (driver_activation_status IN ('active', 'deactivated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_samsara_drivers_company_activation
  ON integrations.samsara_drivers (operating_company_id, driver_activation_status, updated_at DESC);

COMMIT;
