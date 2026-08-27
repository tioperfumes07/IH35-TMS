-- SAFETY-F6767: one active consortium enrollment per company + driver.
-- Preserve history: older duplicate rows are deactivated, never deleted.
WITH ranked_active AS (
  SELECT
    uuid,
    row_number() OVER (
      PARTITION BY operating_company_id, driver_uuid
      ORDER BY enrolled_at DESC, created_at DESC, uuid DESC
    ) AS active_rank
  FROM safety.da_program_enrollments
  WHERE is_active = true
)
UPDATE safety.da_program_enrollments enrollment
SET is_active = false
FROM ranked_active duplicate
WHERE duplicate.uuid = enrollment.uuid
  AND duplicate.active_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_da_program_enrollments_company_driver_active
  ON safety.da_program_enrollments (operating_company_id, driver_uuid)
  WHERE is_active = true;
