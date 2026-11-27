-- PERFUME physical count cycle — owner 2026-11-27 13:50 CT "lets incorporate what we need from here [CONTROL] in the app": CONTROL's
-- Physical Inventory Process (select items and print count sheets → count → variances report → reconciliation update).
--
-- 1. Count cut-off per line. A count line now records WHEN it was counted and by whom (counted_at / counted_by), and its expected_qty
--    is the on-hand AT THAT MOMENT. Posting moves stock by counted − expected (the variance at the moment of counting) against today's
--    stock — so a sale or a receipt between the count and the post is never counted twice (previously the difference was taken
--    against on-hand at the time of posting). A line printed on the sheet but not counted yet has counted_qty / counted_at NULL and
--    moves nothing.
-- 2. The count remembers how its items were picked (selection: category / brand / product type / family / include zero on hand).
-- Existing lines keep their meaning: every line already typed (or pre-filled) is marked counted at its last update.

BEGIN;

ALTER TABLE perfume.stock_count_lines ADD COLUMN IF NOT EXISTS counted_at timestamptz;
ALTER TABLE perfume.stock_count_lines ADD COLUMN IF NOT EXISTS counted_by uuid REFERENCES identity.users(id);
UPDATE perfume.stock_count_lines SET counted_at = updated_at WHERE counted_at IS NULL AND counted_qty IS NOT NULL;
ALTER TABLE perfume.stock_count_lines ALTER COLUMN counted_qty DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_count_lines_counted_pair') THEN
    ALTER TABLE perfume.stock_count_lines ADD CONSTRAINT stock_count_lines_counted_pair
      CHECK ((counted_qty IS NULL AND counted_at IS NULL) OR (counted_qty IS NOT NULL AND counted_qty >= 0 AND counted_at IS NOT NULL));
  END IF;
END $$;

ALTER TABLE perfume.stock_counts ADD COLUMN IF NOT EXISTS selection jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMIT;
