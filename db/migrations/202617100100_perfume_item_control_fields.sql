-- PERFUME CONTROL item fields (LEAD ROUND L.20, owner 2026-11-27 13:50 CT "bring what we need from CONTROL into the app" and 14:16 CT
-- "P1 helps with items"). CONTROL's "Item File Maintenance" carries fields perfume.items did not have:
--   pos_code            the item's code at the register (CONTROL "POS code"); one live item per code
--   ticket_description  the short name printed on the ticket (CONTROL "Ticket description"), up to 40 characters
--   sold_by / units_per_pack  Piece, or Pack of N (CONTROL "Item By Pack / Item By Piece / Packing"); a pack has 2 or more units
--   preferred_vendor_id the vendor we buy it from first (CONTROL "Vendor Number"), a perfume.vendors row
--   is_stock_item       Y = we keep it in stock (CONTROL "Stock item?")
--   is_active           N = hidden from the sales pickers, refused on a new order line (CONTROL "Active?")
--   special_price_cents the special price (CONTROL "Special price")
--   min_price_cents     the floor: an order line below it is refused unless overridden with a written reason (CONTROL "Minimum price")
--   price_locked        "Change price? N": the order line takes the level price and cannot be retyped without an override
-- Every edit is one perfume.item_events 'attributes' row; an override of the minimum or of the lock is one 'price_override' row.
-- Isolated perfume schema (ScentsX LLC). No balances, no posting.

BEGIN;

ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS pos_code text;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS ticket_description text;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS sold_by text NOT NULL DEFAULT 'piece';
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS units_per_pack integer;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS preferred_vendor_id uuid REFERENCES perfume.vendors(id);
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS is_stock_item boolean NOT NULL DEFAULT true;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS special_price_cents bigint;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS min_price_cents bigint;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfume_items_control_check') THEN
    ALTER TABLE perfume.items ADD CONSTRAINT perfume_items_control_check CHECK (
      (pos_code IS NULL OR pos_code ~ '^[A-Za-z0-9-]{1,30}$')
      AND (ticket_description IS NULL OR length(btrim(ticket_description)) BETWEEN 1 AND 40)
      AND sold_by IN ('piece', 'pack')
      AND ((sold_by = 'piece' AND units_per_pack IS NULL) OR (sold_by = 'pack' AND units_per_pack BETWEEN 2 AND 100000))
      AND (special_price_cents IS NULL OR special_price_cents >= 0)
      AND (min_price_cents IS NULL OR min_price_cents >= 0));
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS items_pos_code_uq ON perfume.items (upper(pos_code)) WHERE pos_code IS NOT NULL AND merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS items_preferred_vendor_idx ON perfume.items (preferred_vendor_id) WHERE preferred_vendor_id IS NOT NULL;

-- Superset of 202617030100's kinds + price_override.
ALTER TABLE perfume.item_events DROP CONSTRAINT IF EXISTS item_events_kind_check;
ALTER TABLE perfume.item_events ADD CONSTRAINT item_events_kind_check
  CHECK (kind IN ('edited', 'tio_code', 'upc_added', 'upc_moved_in', 'upc_moved_out', 'hk_code_added', 'hk_code_moved_in', 'hk_code_moved_out',
                  'line_linked', 'codes_filled', 'attributes', 'created', 'family', 'price_override'));

COMMIT;
