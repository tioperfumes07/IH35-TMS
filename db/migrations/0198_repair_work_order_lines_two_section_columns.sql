-- 0198_repair_work_order_lines_two_section_columns.sql
-- Forward repair for 0050 checksum/content drift:
-- production recorded 0050 as applied, but the two-section work_order_lines columns were never applied.
-- This migration applies those columns forward without editing 0050.

BEGIN;

DO $$
BEGIN
  IF to_regclass('maintenance.work_order_lines') IS NOT NULL THEN
    ALTER TABLE maintenance.work_order_lines
      ADD COLUMN IF NOT EXISTS section char(1) NOT NULL DEFAULT 'B' CHECK (section IN ('A', 'B')),
      ADD COLUMN IF NOT EXISTS parent_line_uuid uuid REFERENCES maintenance.work_order_lines(uuid),
      ADD COLUMN IF NOT EXISTS expense_category_uuid uuid,
      ADD COLUMN IF NOT EXISTS service_item_uuid uuid,
      ADD COLUMN IF NOT EXISTS part_uuid uuid,
      ADD COLUMN IF NOT EXISTS labor_rate_uuid uuid,
      ADD COLUMN IF NOT EXISTS part_location_codes text[];
  END IF;
END
$$;

COMMIT;
