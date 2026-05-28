BEGIN;

CREATE INDEX IF NOT EXISTS idx_driver_qualification_files_tenant_driver_active
  ON safety.driver_qualification_files (operating_company_id, driver_id)
  WHERE voided_at IS NULL;

ALTER TABLE safety.driver_qualification_files
  DROP CONSTRAINT IF EXISTS driver_qualification_files_status_check;

ALTER TABLE safety.driver_qualification_files
  ADD CONSTRAINT driver_qualification_files_status_check
  CHECK (status IN ('present', 'missing', 'expired'));

COMMIT;
