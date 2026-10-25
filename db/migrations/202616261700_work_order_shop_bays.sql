-- LEAD 443.301 · register row 59 · Maintenance › In Shop bay board (approved V3 board docs/design/v3/Maintenance-InShop).
-- A work order can occupy one shop bay. The bay is held from assignment until it is RELEASED (a finished truck still
-- parked in the bay shows "Ready" until it rolls out), so occupancy is keyed on bay_released_at, not on WO status.
-- One occupied bay per company per bay number (partial unique). Bay count is a company setting, never a literal.
-- Idempotent, additive only (no DROP). Same identity.users FK pattern as approved_by / completed_by / voided_by.
BEGIN;

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS bay_number smallint,
  ADD COLUMN IF NOT EXISTS bay_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS bay_assigned_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS bay_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS bay_released_by_user_id uuid;

DO $bay$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_bay_number_positive'
                 AND conrelid = 'maintenance.work_orders'::regclass) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_bay_number_positive CHECK (bay_number IS NULL OR bay_number >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_bay_assignment_complete'
                 AND conrelid = 'maintenance.work_orders'::regclass) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_bay_assignment_complete CHECK (
        (bay_number IS NULL AND bay_assigned_at IS NULL AND bay_released_at IS NULL)
        OR (bay_number IS NOT NULL AND bay_assigned_at IS NOT NULL
            AND (bay_released_at IS NULL OR bay_released_at >= bay_assigned_at))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_bay_assigned_by_user_id_fkey'
                 AND conrelid = 'maintenance.work_orders'::regclass) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_bay_assigned_by_user_id_fkey FOREIGN KEY (bay_assigned_by_user_id) REFERENCES identity.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_bay_released_by_user_id_fkey'
                 AND conrelid = 'maintenance.work_orders'::regclass) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_bay_released_by_user_id_fkey FOREIGN KEY (bay_released_by_user_id) REFERENCES identity.users(id);
  END IF;
END
$bay$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_orders_bay_occupied
  ON maintenance.work_orders (operating_company_id, bay_number)
  WHERE bay_number IS NOT NULL AND bay_released_at IS NULL AND voided_at IS NULL;

ALTER TABLE maintenance.maintenance_settings
  ADD COLUMN IF NOT EXISTS shop_bay_count smallint NOT NULL DEFAULT 4;

DO $cnt$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_settings_shop_bay_count_range'
                 AND conrelid = 'maintenance.maintenance_settings'::regclass) THEN
    ALTER TABLE maintenance.maintenance_settings
      ADD CONSTRAINT maintenance_settings_shop_bay_count_range CHECK (shop_bay_count BETWEEN 1 AND 50);
  END IF;
END
$cnt$;

COMMIT;
