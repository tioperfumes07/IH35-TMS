-- PERFUME-SALES-ORDERS + PURCHASE-ORDERS. PERFUME-SALES-ORDERS (owner 2026-11-26 19:08 CT "continue" — the next module after Quotes: an accepted quote becomes an
-- order). A sales order is what a customer bought: numbered SO-000001, made from a quote (or started by hand), its lines with
-- quantity ordered and quantity shipped, a ship-by date, a status (open → shipped / cancelled) and its full history. Excel and
-- PDF are made from it on request.
--
-- 1) perfume.sales_orders        — the header; quote_id links back to the quote it came from.
-- 2) perfume.sales_order_lines   — one line per item: qty ordered, qty shipped, unit price, the cost seen on the quote.
-- 3) perfume.sales_order_events  — the history (append-only).
--
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting (owner: "maybe later"),
-- references only perfume.* and identity.users. FORCE RLS owner-only. No DELETE grant. Money is integer cents, exact.
-- Additive, idempotent.

CREATE SEQUENCE IF NOT EXISTS perfume.sales_order_number_seq START 1;

CREATE TABLE IF NOT EXISTS perfume.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT ('SO-' || lpad(nextval('perfume.sales_order_number_seq')::text, 6, '0')),
  quote_id uuid REFERENCES perfume.quotes(id),
  company_id uuid REFERENCES perfume.contact_companies(id),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 300),
  customer_email text,
  customer_phone text,
  ship_to text,
  order_date date NOT NULL DEFAULT current_date,
  ship_by date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'shipped', 'cancelled')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'MXN')),
  terms text,
  notes text,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_number_uq ON perfume.sales_orders (number);
-- One live order per quote: converting the same quote twice opens the order it already has.
CREATE UNIQUE INDEX IF NOT EXISTS sales_orders_quote_uq ON perfume.sales_orders (quote_id) WHERE quote_id IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_orders_company_idx ON perfume.sales_orders (company_id);

CREATE TABLE IF NOT EXISTS perfume.sales_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES perfume.sales_orders(id),
  line_no integer NOT NULL CHECK (line_no > 0),
  quote_line_id uuid REFERENCES perfume.quote_lines(id),
  item_id uuid REFERENCES perfume.items(id),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 400),
  upc text,
  qty integer NOT NULL CHECK (qty > 0),
  qty_shipped integer NOT NULL DEFAULT 0 CHECK (qty_shipped >= 0),
  unit_price_cents bigint NOT NULL CHECK (unit_price_cents >= 0),
  cost_cents bigint CHECK (cost_cents IS NULL OR cost_cents >= 0),
  cost_vendor_id uuid REFERENCES perfume.vendors(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (qty_shipped <= qty)
);
CREATE INDEX IF NOT EXISTS sales_order_lines_order_idx ON perfume.sales_order_lines (order_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS sales_order_lines_item_idx ON perfume.sales_order_lines (item_id);

CREATE TABLE IF NOT EXISTS perfume.sales_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES perfume.sales_orders(id),
  kind text NOT NULL CHECK (kind IN ('created', 'edited', 'line_added', 'line_changed', 'line_removed', 'shipped', 'status', 'exported_xlsx', 'exported_pdf')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_order_events_order_idx ON perfume.sales_order_events (order_id, created_at);

-- A quote turned into an order is recorded in the quote's own history too.
ALTER TABLE perfume.quote_events DROP CONSTRAINT IF EXISTS quote_events_kind_check;
ALTER TABLE perfume.quote_events ADD CONSTRAINT quote_events_kind_check CHECK (kind IN ('created', 'edited', 'line_added', 'line_changed', 'line_removed', 'status',
  'exported_xlsx', 'exported_pdf', 'copied_from', 'ordered'));

ALTER TABLE perfume.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.sales_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_orders_owner_only ON perfume.sales_orders;
CREATE POLICY sales_orders_owner_only ON perfume.sales_orders USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.sales_orders TO ih35_app;

ALTER TABLE perfume.sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.sales_order_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_order_lines_owner_only ON perfume.sales_order_lines;
CREATE POLICY sales_order_lines_owner_only ON perfume.sales_order_lines USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.sales_order_lines TO ih35_app;

ALTER TABLE perfume.sales_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.sales_order_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_order_events_owner_only ON perfume.sales_order_events;
CREATE POLICY sales_order_events_owner_only ON perfume.sales_order_events USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT ON perfume.sales_order_events TO ih35_app;

GRANT USAGE, SELECT ON SEQUENCE perfume.sales_order_number_seq TO ih35_app;

-- PERFUME-PURCHASE-ORDERS (owner 2026-11-26 19:12 CT: "sales order and purchase ordres should already be created"). A purchase
-- order is what I buy from one vendor (perfume.vendors): numbered PO-000001, started by hand or from a sales order (each open
-- line goes to the vendor with the lowest current price), its lines with the vendor's own code and description from their
-- current list, qty ordered and qty received, an expected date, a status (open → received / cancelled) and its history.

CREATE SEQUENCE IF NOT EXISTS perfume.purchase_order_number_seq START 1;

CREATE TABLE IF NOT EXISTS perfume.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT ('PO-' || lpad(nextval('perfume.purchase_order_number_seq')::text, 6, '0')),
  vendor_id uuid NOT NULL REFERENCES perfume.vendors(id),
  sales_order_id uuid REFERENCES perfume.sales_orders(id),
  order_date date NOT NULL DEFAULT current_date,
  expected_by date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'received', 'cancelled')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'MXN')),
  terms text,
  notes text,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_number_uq ON perfume.purchase_orders (number);
CREATE INDEX IF NOT EXISTS purchase_orders_vendor_idx ON perfume.purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS purchase_orders_so_idx ON perfume.purchase_orders (sales_order_id);

CREATE TABLE IF NOT EXISTS perfume.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES perfume.purchase_orders(id),
  line_no integer NOT NULL CHECK (line_no > 0),
  sales_order_line_id uuid REFERENCES perfume.sales_order_lines(id),
  item_id uuid REFERENCES perfume.items(id),
  price_list_row_id uuid REFERENCES perfume.price_list_rows(id),
  vendor_sku text,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 400),
  upc text,
  qty integer NOT NULL CHECK (qty > 0),
  qty_received integer NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  unit_cost_cents bigint NOT NULL CHECK (unit_cost_cents >= 0),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (qty_received <= qty)
);
CREATE INDEX IF NOT EXISTS purchase_order_lines_po_idx ON perfume.purchase_order_lines (po_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS purchase_order_lines_item_idx ON perfume.purchase_order_lines (item_id);
CREATE INDEX IF NOT EXISTS purchase_order_lines_sol_idx ON perfume.purchase_order_lines (sales_order_line_id);

CREATE TABLE IF NOT EXISTS perfume.purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES perfume.purchase_orders(id),
  kind text NOT NULL CHECK (kind IN ('created', 'edited', 'line_added', 'line_changed', 'line_removed', 'received', 'status', 'exported_xlsx', 'exported_pdf')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_order_events_po_idx ON perfume.purchase_order_events (po_id, created_at);

-- A sales order that bought its goods says so in its own history.
ALTER TABLE perfume.sales_order_events DROP CONSTRAINT IF EXISTS sales_order_events_kind_check;
ALTER TABLE perfume.sales_order_events ADD CONSTRAINT sales_order_events_kind_check CHECK (kind IN ('created', 'edited', 'line_added', 'line_changed', 'line_removed',
  'shipped', 'status', 'exported_xlsx', 'exported_pdf', 'purchased'));

ALTER TABLE perfume.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.purchase_orders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_orders_owner_only ON perfume.purchase_orders;
CREATE POLICY purchase_orders_owner_only ON perfume.purchase_orders USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.purchase_orders TO ih35_app;

ALTER TABLE perfume.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.purchase_order_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_order_lines_owner_only ON perfume.purchase_order_lines;
CREATE POLICY purchase_order_lines_owner_only ON perfume.purchase_order_lines USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.purchase_order_lines TO ih35_app;

ALTER TABLE perfume.purchase_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.purchase_order_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_order_events_owner_only ON perfume.purchase_order_events;
CREATE POLICY purchase_order_events_owner_only ON perfume.purchase_order_events USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT ON perfume.purchase_order_events TO ih35_app;

GRANT USAGE, SELECT ON SEQUENCE perfume.purchase_order_number_seq TO ih35_app;

-- PERFUME-VENDOR-PROFILE (owner 19:12 CT: "i need my complete customer and vendors profile"). A price-list vendor is the same
-- business as its company in Contacts: the vendor carries that company, so the profile shows both sides (price lists, items,
-- POs ↔ people, phones, quotes, orders). Linked here only where exactly one live company has the same name; the rest are
-- linked on the vendor's profile by hand.
ALTER TABLE perfume.vendors ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES perfume.contact_companies(id);
CREATE INDEX IF NOT EXISTS vendors_company_idx ON perfume.vendors (company_id);
UPDATE perfume.vendors v SET company_id = m.company_id, updated_at = now()
  FROM (SELECT v2.id AS vendor_id, min(cc.id::text)::uuid AS company_id
          FROM perfume.vendors v2 JOIN perfume.contact_companies cc ON cc.name_key = perfume.name_key(v2.name) AND cc.archived_at IS NULL
         WHERE v2.company_id IS NULL AND v2.archived_at IS NULL
         GROUP BY v2.id HAVING count(*) = 1) m
 WHERE v.id = m.vendor_id;
