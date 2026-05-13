-- P6-T11180 — Work orders: persisted QuickBooks vendor FK + mirror qbo_id (additive).
-- Links maintenance.work_orders.vendor_id → mdata.qbo_vendors(id) for live vendor selection.
-- No backfill from external_vendor_id (different FK domain / legacy mdata.vendors).

BEGIN;

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NULL THEN
    RAISE NOTICE 'Skipping 0146: maintenance.work_orders missing';
  ELSE
    ALTER TABLE maintenance.work_orders
      ADD COLUMN IF NOT EXISTS vendor_id UUID,
      ADD COLUMN IF NOT EXISTS vendor_qbo_id TEXT;

    IF to_regclass('mdata.qbo_vendors') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_constraint
         WHERE conname = 'fk_maintenance_work_orders_qbo_vendor'
           AND conrelid = 'maintenance.work_orders'::regclass
       )
    THEN
      ALTER TABLE maintenance.work_orders
        ADD CONSTRAINT fk_maintenance_work_orders_qbo_vendor
        FOREIGN KEY (vendor_id)
        REFERENCES mdata.qbo_vendors(id)
        ON DELETE SET NULL;
    END IF;

    CREATE INDEX IF NOT EXISTS ix_work_orders_vendor_qbo
      ON maintenance.work_orders(vendor_id)
      WHERE vendor_id IS NOT NULL;
  END IF;
END $$;

COMMIT;
