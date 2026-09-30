-- 202614830000_work_orders_backfill_source_type.sql
-- ROUND 297.2 A-29 (Lead order): the order's own literal spec is
-- "maintenance.work_orders row, status='complete', source_type='backfill'". Live-verified the
-- existing chk_maintenance_wo_source_type CHECK only allows ('IS','ES','AC','ET','RT','IT','RS') --
-- 4 of those 7 in live use (IS/RS/IT/AC, 16 rows total). 'backfill' does not exist. Widens the
-- CHECK to add it, matching the order's literal value so a real service-history backfill is
-- distinguishable from every other work-order origin. Additive only -- the 4 already-live values
-- and their rows are completely unaffected.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_maintenance_wo_source_type'
      AND pg_get_constraintdef(oid) LIKE '%backfill%'
  ) THEN
    ALTER TABLE maintenance.work_orders DROP CONSTRAINT chk_maintenance_wo_source_type;
    ALTER TABLE maintenance.work_orders ADD CONSTRAINT chk_maintenance_wo_source_type
      CHECK (source_type = ANY (ARRAY['IS','ES','AC','ET','RT','IT','RS','backfill']));
  END IF;
END $$;

COMMIT;
