-- LV-INVENTORY-REORDER-THRESHOLD-NOT-PERSISTED
-- The API and both inventory drawers expose reorder_threshold, but the canonical table never
-- stored it. Preserve the operator-entered value on every create/import/update/read path.

ALTER TABLE maintenance.parts_inventory
  ADD COLUMN IF NOT EXISTS reorder_threshold integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'maintenance.parts_inventory'::regclass
       AND conname = 'parts_inventory_reorder_threshold_nonnegative'
  ) THEN
    ALTER TABLE maintenance.parts_inventory
      ADD CONSTRAINT parts_inventory_reorder_threshold_nonnegative
      CHECK (reorder_threshold >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN maintenance.parts_inventory.reorder_threshold IS
  'Tenant-scoped on-hand quantity at or below which the part requires reorder.';
