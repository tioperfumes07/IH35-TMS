-- PERFUME-INVENTORY (ScentsX / TIO Perfumes). Owner 2026-11-26 20:21 CT: "multiple inventories warehouses retail locations
-- different price levels credit limits approvals …"; answers 20:28 CT: the stock sites are the ones in his inventory file
-- (perfume.locations), "we should use fifo, but we use avg cost for lists etc, we need to be able to manage both",
-- stock adjustments over $500 need a second person.
--
-- Stock is a ledger, never a typed number: on hand = the sum of append-only stock moves. Every move carries the FIFO cost
-- of the lot it used AND the item's moving-average cost at that site after the move. Lots (FIFO layers) keep their vendor
-- and PO line so a recall or counterfeit claim traces to its supplier. Negative stock is refused.
-- journal_entry_id is left for the accounting layer (ScentsX company, 10-23-2026 agent's blocks); nothing here writes
-- accounting.

ALTER TABLE perfume.locations ADD COLUMN IF NOT EXISTS kind text CHECK (kind IN ('warehouse', 'store', 'transit', 'consignment'));
ALTER TABLE perfume.locations ADD COLUMN IF NOT EXISTS own boolean NOT NULL DEFAULT true;
ALTER TABLE perfume.locations ADD COLUMN IF NOT EXISTS address text;
-- Goods between two sites sit here while a transfer is on the road.
INSERT INTO perfume.locations (code, name, sort_order, active, kind, own) VALUES ('TRANSIT', 'In transit', 999, true, 'transit', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS perfume.inventory_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  location_code text NOT NULL REFERENCES perfume.locations(code),
  lot_code text,
  source text NOT NULL CHECK (source IN ('opening', 'receipt', 'transfer', 'return', 'adjustment', 'count')),
  received_on date NOT NULL DEFAULT current_date,
  qty_in integer NOT NULL CHECK (qty_in > 0),
  qty_left integer NOT NULL CHECK (qty_left >= 0),
  unit_cost_cents numeric(14, 4) NOT NULL CHECK (unit_cost_cents >= 0),
  vendor_id uuid REFERENCES perfume.vendors(id),
  po_line_id uuid REFERENCES perfume.purchase_order_lines(id),
  parent_lot_id uuid REFERENCES perfume.inventory_lots(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (qty_left <= qty_in)
);
CREATE INDEX IF NOT EXISTS inventory_lots_fifo_idx ON perfume.inventory_lots (item_id, location_code, received_on, created_at) WHERE qty_left > 0;
CREATE INDEX IF NOT EXISTS inventory_lots_po_line_idx ON perfume.inventory_lots (po_line_id);
CREATE INDEX IF NOT EXISTS inventory_lots_vendor_idx ON perfume.inventory_lots (vendor_id);

-- On hand + moving average per item per site (kept by the service in the same transaction as each move).
CREATE TABLE IF NOT EXISTS perfume.item_stock (
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  location_code text NOT NULL REFERENCES perfume.locations(code),
  qty integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  avg_cost_cents numeric(14, 4) NOT NULL DEFAULT 0 CHECK (avg_cost_cents >= 0),
  min_qty integer CHECK (min_qty >= 0),
  max_qty integer CHECK (max_qty >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, location_code)
);

CREATE SEQUENCE IF NOT EXISTS perfume.stock_transfer_number_seq START 1;
CREATE TABLE IF NOT EXISTS perfume.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT ('TR-' || lpad(nextval('perfume.stock_transfer_number_seq')::text, 6, '0')),
  from_code text NOT NULL REFERENCES perfume.locations(code),
  to_code text NOT NULL REFERENCES perfume.locations(code),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'shipped', 'received', 'cancelled')),
  notes text,
  shipped_at timestamptz, shipped_by uuid REFERENCES identity.users(id),
  received_at timestamptz, received_by uuid REFERENCES identity.users(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_code <> to_code)
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_number_uq ON perfume.stock_transfers (number);
CREATE TABLE IF NOT EXISTS perfume.stock_transfer_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES perfume.stock_transfers(id),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  qty integer NOT NULL CHECK (qty > 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_transfer_lines_transfer_idx ON perfume.stock_transfer_lines (transfer_id);

CREATE SEQUENCE IF NOT EXISTS perfume.stock_count_number_seq START 1;
CREATE TABLE IF NOT EXISTS perfume.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT ('CC-' || lpad(nextval('perfume.stock_count_number_seq')::text, 6, '0')),
  location_code text NOT NULL REFERENCES perfume.locations(code),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'posted', 'cancelled')),
  diff_value_cents numeric(14, 2),
  notes text,
  submitted_by uuid REFERENCES identity.users(id), submitted_at timestamptz,
  approved_by uuid REFERENCES identity.users(id), approved_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Owner 20:28 CT: an adjustment over $500 needs a second person.
  CHECK (approved_by IS NULL OR coalesce(abs(diff_value_cents), 0) <= 50000 OR approved_by IS DISTINCT FROM submitted_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_counts_number_uq ON perfume.stock_counts (number);
CREATE TABLE IF NOT EXISTS perfume.stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES perfume.stock_counts(id),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  expected_qty integer NOT NULL,
  counted_qty integer NOT NULL CHECK (counted_qty >= 0),
  unit_cost_cents numeric(14, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, item_id)
);

CREATE TABLE IF NOT EXISTS perfume.stock_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  kind text NOT NULL CHECK (kind IN ('opening', 'receipt', 'shipment', 'transfer_out', 'transfer_in', 'adjustment', 'count', 'return', 'write_down')),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  location_code text NOT NULL REFERENCES perfume.locations(code),
  qty integer NOT NULL CHECK (qty <> 0),
  unit_cost_cents numeric(14, 4) NOT NULL CHECK (unit_cost_cents >= 0),
  lot_id uuid REFERENCES perfume.inventory_lots(id),
  qty_after integer NOT NULL CHECK (qty_after >= 0),
  avg_cost_after_cents numeric(14, 4) NOT NULL,
  purchase_order_id uuid REFERENCES perfume.purchase_orders(id),
  po_line_id uuid REFERENCES perfume.purchase_order_lines(id),
  sales_order_id uuid REFERENCES perfume.sales_orders(id),
  so_line_id uuid REFERENCES perfume.sales_order_lines(id),
  transfer_id uuid REFERENCES perfume.stock_transfers(id),
  count_id uuid REFERENCES perfume.stock_counts(id),
  reason text,
  -- The ScentsX journal entry this move posted to (accounting layer fills it; no FK across the perfume wall).
  journal_entry_id uuid,
  created_by uuid REFERENCES identity.users(id)
);
CREATE INDEX IF NOT EXISTS stock_moves_item_loc_idx ON perfume.stock_moves (item_id, location_code, moved_at);
CREATE INDEX IF NOT EXISTS stock_moves_po_idx ON perfume.stock_moves (purchase_order_id);
CREATE INDEX IF NOT EXISTS stock_moves_so_idx ON perfume.stock_moves (sales_order_id);
CREATE INDEX IF NOT EXISTS stock_moves_lot_idx ON perfume.stock_moves (lot_id);

-- Where a PO's goods arrive and where an order ships from.
ALTER TABLE perfume.purchase_orders ADD COLUMN IF NOT EXISTS location_code text REFERENCES perfume.locations(code);
ALTER TABLE perfume.sales_orders ADD COLUMN IF NOT EXISTS location_code text REFERENCES perfume.locations(code);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['inventory_lots', 'item_stock', 'stock_transfers', 'stock_transfer_lines', 'stock_counts', 'stock_count_lines', 'stock_moves'] LOOP
    EXECUTE format('ALTER TABLE perfume.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE perfume.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON perfume.%I', t || '_owner_only', t);
    EXECUTE format('CREATE POLICY %I ON perfume.%I USING (perfume.is_owner()) WITH CHECK (perfume.is_owner())', t || '_owner_only', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON perfume.inventory_lots, perfume.item_stock, perfume.stock_transfers, perfume.stock_transfer_lines,
  perfume.stock_counts, perfume.stock_count_lines TO ih35_app;
-- The ledger itself: written once, never changed.
GRANT SELECT, INSERT ON perfume.stock_moves TO ih35_app;
GRANT USAGE, SELECT ON SEQUENCE perfume.stock_transfer_number_seq, perfume.stock_count_number_seq TO ih35_app;
