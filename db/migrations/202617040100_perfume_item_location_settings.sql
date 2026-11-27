-- PERFUME item per-site settings — owner 2026-11-27 08:10 CT "We must also have locations … make this more efficient and professional".
--
-- perfume.item_stock (one row per item per site) already carries qty, average cost, min_qty and max_qty. Added, nullable:
--   bin         — where the item sits inside the site (shelf / aisle / bin, as he labels it)
--   reorder_qty — the quantity he normally buys when the item reaches its minimum (a case or a standard order)
-- The reorder report reads min / max / reorder qty against on hand + already on open purchase orders, and turns the shortfall into
-- purchase orders through the existing PO engine (one PO per cheapest current vendor). Additive only.

BEGIN;

ALTER TABLE perfume.item_stock ADD COLUMN IF NOT EXISTS bin text;
ALTER TABLE perfume.item_stock ADD COLUMN IF NOT EXISTS reorder_qty integer;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'item_stock_bin_reorder_check') THEN
    ALTER TABLE perfume.item_stock ADD CONSTRAINT item_stock_bin_reorder_check
      CHECK ((bin IS NULL OR length(bin) <= 40) AND (reorder_qty IS NULL OR reorder_qty > 0));
  END IF;
END $$;

COMMIT;
