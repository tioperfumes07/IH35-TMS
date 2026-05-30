BEGIN;

DO $$
BEGIN
  -- Preferred legacy object name from contract.
  IF to_regclass('maint.work_order') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_maint_work_order_driver_status
             ON maint.work_order (driver_id, status)';
  END IF;

  -- Canonical maintenance work order table in this codebase.
  IF to_regclass('maintenance.work_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_maintenance_work_orders_driver_status
      ON maintenance.work_orders (driver_id, status);
  END IF;
END
$$;

COMMIT;
