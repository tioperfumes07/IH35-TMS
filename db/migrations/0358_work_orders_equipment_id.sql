BEGIN;

-- Block B26: TrailerProfile WO history canonical filter via equipment_id.
-- ARCHIVE-not-DELETE: column is additive; orphan WOs remain equipment_id IS NULL.

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NULL THEN
    RAISE NOTICE 'Skipping 0358: maintenance.work_orders missing';
    RETURN;
  END IF;

  ALTER TABLE maintenance.work_orders
    ADD COLUMN IF NOT EXISTS equipment_id uuid;

  IF to_regclass('mdata.equipment') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'fk_maintenance_work_orders_equipment'
         AND conrelid = 'maintenance.work_orders'::regclass
     ) THEN
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT fk_maintenance_work_orders_equipment
      FOREIGN KEY (equipment_id)
      REFERENCES mdata.equipment(id)
      ON DELETE SET NULL;
  END IF;

  IF to_regclass('mdata.equipment') IS NOT NULL THEN
    UPDATE maintenance.work_orders wo
    SET equipment_id = pick.equipment_id
    FROM (
      SELECT wo2.id AS work_order_id,
             MIN(e.id::text)::uuid AS equipment_id
      FROM maintenance.work_orders wo2
      INNER JOIN mdata.equipment e
        ON e.current_unit_id = wo2.unit_id
       AND (
         e.owner_company_id = wo2.operating_company_id
         OR e.currently_leased_to_company_id = wo2.operating_company_id
       )
      WHERE wo2.equipment_id IS NULL
        AND wo2.unit_id IS NOT NULL
      GROUP BY wo2.id
      HAVING COUNT(e.id) = 1
    ) pick
    WHERE wo.id = pick.work_order_id
      AND wo.equipment_id IS NULL;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_maint_work_orders_equipment
    ON maintenance.work_orders (operating_company_id, equipment_id)
    WHERE equipment_id IS NOT NULL;

  COMMENT ON COLUMN maintenance.work_orders.equipment_id IS
    'Canonical trailer/equipment link for TrailerProfile WO history (B26). Nullable; orphan WOs remain NULL when backfill is ambiguous.';
END
$$;

COMMIT;

-- DOWN (manual rollback — run outside transaction if needed):
-- DROP INDEX IF EXISTS maintenance.idx_maint_work_orders_equipment;
-- ALTER TABLE maintenance.work_orders DROP CONSTRAINT IF EXISTS fk_maintenance_work_orders_equipment;
-- ALTER TABLE maintenance.work_orders DROP COLUMN IF EXISTS equipment_id;
