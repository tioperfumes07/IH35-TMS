-- PERFUME B5 + B8 (ScentsX / TIO Perfumes). Owner 2026-11-26 20:21 CT: "multiple inventories warehouses retail locations …
-- approvals"; 20:28 CT: adjustments over $500 need a second person; 21:24 CT: "just create the engines and complete. Fully
-- linked and wired."
--
-- 1. Quarantine sites: a site of kind 'quarantine' holds stock that cannot be sold or shipped (suspected counterfeit,
--    damaged, recalled, waiting on a vendor claim). Goods go in and out by transfer; a sales order never ships from it.
-- 2. Write-offs (WO-000001): pieces destroyed, expired, stolen or counterfeit leave stock FIFO at their lot cost, each move
--    of kind 'write_down' carrying writeoff_id. Over $500 the person who posts is not the person who submitted (DB CHECK).
-- 3. PO approval: perfume.settings.rules->>'po_approval_over_cents' is the amount the owner types (NULL = no approval
--    step). A PO whose total reaches it is received only once approved; approval is recorded on the PO and in its history.
-- Nothing here writes accounting.* — the books link each write_down move by its id (10-23-2026 agent's poster).

BEGIN;

ALTER TABLE perfume.locations DROP CONSTRAINT IF EXISTS locations_kind_check;
ALTER TABLE perfume.locations ADD CONSTRAINT locations_kind_check
  CHECK (kind IN ('warehouse', 'store', 'transit', 'consignment', 'quarantine'));

CREATE SEQUENCE IF NOT EXISTS perfume.stock_writeoff_number_seq START 1;
CREATE TABLE IF NOT EXISTS perfume.stock_writeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL DEFAULT ('WO-' || lpad(nextval('perfume.stock_writeoff_number_seq')::text, 6, '0')),
  location_code text NOT NULL REFERENCES perfume.locations(code),
  reason text NOT NULL CHECK (reason IN ('damaged', 'expired', 'stolen', 'counterfeit', 'sample', 'other')),
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'posted', 'cancelled')),
  value_cents numeric(14, 2),
  submitted_by uuid REFERENCES identity.users(id), submitted_at timestamptz,
  approved_by uuid REFERENCES identity.users(id), approved_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reason <> 'other' OR length(btrim(coalesce(notes, ''))) > 0),
  -- Owner 20:28 CT: over $500 a second person.
  CHECK (approved_by IS NULL OR coalesce(value_cents, 0) <= 50000 OR approved_by IS DISTINCT FROM submitted_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_writeoffs_number_uq ON perfume.stock_writeoffs (number);
CREATE TABLE IF NOT EXISTS perfume.stock_writeoff_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  writeoff_id uuid NOT NULL REFERENCES perfume.stock_writeoffs(id),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  qty integer NOT NULL CHECK (qty > 0),
  lot_id uuid REFERENCES perfume.inventory_lots(id),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_writeoff_lines_wo_idx ON perfume.stock_writeoff_lines (writeoff_id);

ALTER TABLE perfume.stock_moves ADD COLUMN IF NOT EXISTS writeoff_id uuid REFERENCES perfume.stock_writeoffs(id);
CREATE INDEX IF NOT EXISTS stock_moves_writeoff_idx ON perfume.stock_moves (writeoff_id) WHERE writeoff_id IS NOT NULL;

ALTER TABLE perfume.purchase_orders ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES identity.users(id);
ALTER TABLE perfume.purchase_orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE perfume.purchase_orders ADD COLUMN IF NOT EXISTS approval_note text;
ALTER TABLE perfume.purchase_order_events DROP CONSTRAINT IF EXISTS purchase_order_events_kind_check;
ALTER TABLE perfume.purchase_order_events ADD CONSTRAINT purchase_order_events_kind_check
  CHECK (kind IN ('created', 'edited', 'line_added', 'line_changed', 'line_removed', 'received', 'status', 'exported_xlsx', 'exported_pdf',
                  'approved', 'approval_removed'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_writeoffs', 'stock_writeoff_lines'] LOOP
    EXECUTE format('ALTER TABLE perfume.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE perfume.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON perfume.%I', t || '_owner_only', t);
    EXECUTE format('CREATE POLICY %I ON perfume.%I USING (perfume.is_owner()) WITH CHECK (perfume.is_owner())', t || '_owner_only', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON perfume.stock_writeoffs, perfume.stock_writeoff_lines TO ih35_app;
GRANT USAGE, SELECT ON SEQUENCE perfume.stock_writeoff_number_seq TO ih35_app;

COMMIT;
