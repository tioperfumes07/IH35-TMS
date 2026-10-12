-- LEAD 443.129 A / B / C (Codex audit AJK-02, AJK-06, AJK-07) — a roadside ticket carries what its money needs.
--
-- A (AJK-02): a ticket paid by card is an EXPENSE on that card; paid from a driver advance it is an expense paid out of
--   the driver's advance account; only a vendor invoice makes an A/P bill. The card / bank account the ticket was paid
--   with is recorded on the ticket (payment_account_uuid), and the expense the ticket produced is kept (expense_id), the
--   same way bill_id is kept for the vendor-invoice path.
-- B (AJK-06): the ticket carries the hub links of the moment the truck broke down — the load the truck was running at the
--   event time (the one load-at-time rule), that load's trailer (company trailer, or the customer trailer as a
--   non-owned trailer — never both), or the explicit no-load reason when no load covered the truck.
-- C (AJK-07): the ticket names its ITEM (catalogs.items); the item's category and expense account are the line's — no
--   category is ever guessed.
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS; constraints added only when absent. No data is written. No RLS or
-- grant change: the columns land on a table that already has both (202606281020_road_service_tickets.sql).

ALTER TABLE maintenance.road_service_tickets ADD COLUMN IF NOT EXISTS item_id uuid;
ALTER TABLE maintenance.road_service_tickets ADD COLUMN IF NOT EXISTS payment_account_uuid uuid;
ALTER TABLE maintenance.road_service_tickets ADD COLUMN IF NOT EXISTS load_id uuid;
ALTER TABLE maintenance.road_service_tickets ADD COLUMN IF NOT EXISTS trailer_id uuid;
ALTER TABLE maintenance.road_service_tickets ADD COLUMN IF NOT EXISTS non_owned_trailer_id uuid;
ALTER TABLE maintenance.road_service_tickets ADD COLUMN IF NOT EXISTS load_exemption_reason text;
ALTER TABLE maintenance.road_service_tickets ADD COLUMN IF NOT EXISTS expense_id uuid;

DO $$
BEGIN
  -- Same-company composite keys: each parent carries UNIQUE (operating_company_id, id).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_service_tickets_item_same_entity_fkey') THEN
    ALTER TABLE maintenance.road_service_tickets ADD CONSTRAINT road_service_tickets_item_same_entity_fkey
      FOREIGN KEY (operating_company_id, item_id) REFERENCES catalogs.items (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_service_tickets_payment_account_same_entity_fkey') THEN
    ALTER TABLE maintenance.road_service_tickets ADD CONSTRAINT road_service_tickets_payment_account_same_entity_fkey
      FOREIGN KEY (operating_company_id, payment_account_uuid) REFERENCES catalogs.accounts (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_service_tickets_load_same_entity_fkey') THEN
    ALTER TABLE maintenance.road_service_tickets ADD CONSTRAINT road_service_tickets_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_service_tickets_non_owned_trailer_same_entity_fkey') THEN
    ALTER TABLE maintenance.road_service_tickets ADD CONSTRAINT road_service_tickets_non_owned_trailer_same_entity_fkey
      FOREIGN KEY (operating_company_id, non_owned_trailer_id) REFERENCES dispatch.non_owned_trailers (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_service_tickets_expense_same_entity_fkey') THEN
    ALTER TABLE maintenance.road_service_tickets ADD CONSTRAINT road_service_tickets_expense_same_entity_fkey
      FOREIGN KEY (operating_company_id, expense_id) REFERENCES accounting.expenses (operating_company_id, id);
  END IF;
  -- mdata.equipment has no operating_company_id (owner / leased-to pair): a plain key; the writer checks the company owns
  -- or leases the trailer (the one trailer rule, accounting/load-trailer.sql.ts).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_service_tickets_trailer_fkey') THEN
    ALTER TABLE maintenance.road_service_tickets ADD CONSTRAINT road_service_tickets_trailer_fkey
      FOREIGN KEY (trailer_id) REFERENCES mdata.equipment (id);
  END IF;
  -- One trailer kind per ticket: the company trailer or the customer (non-owned) trailer, never both.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'road_service_tickets_one_trailer_kind') THEN
    ALTER TABLE maintenance.road_service_tickets ADD CONSTRAINT road_service_tickets_one_trailer_kind
      CHECK (trailer_id IS NULL OR non_owned_trailer_id IS NULL);
  END IF;
END $$;

COMMENT ON COLUMN maintenance.road_service_tickets.item_id IS
  'LEAD 443.129 C (AJK-07): the item the roadside cost is booked to; its category and expense account are the work order line''s and the document line''s. Never guessed.';
COMMENT ON COLUMN maintenance.road_service_tickets.payment_account_uuid IS
  'LEAD 443.129 A (AJK-02): the card / bank account a card-paid ticket was paid with (the expense''s payment account).';
COMMENT ON COLUMN maintenance.road_service_tickets.load_id IS
  'LEAD 443.129 B (AJK-06): the load the truck was running at the event time (one load-at-time rule).';
COMMENT ON COLUMN maintenance.road_service_tickets.load_exemption_reason IS
  'LEAD 443.129 B (AJK-06): why the ticket has no load — no load covered the truck at the event time.';
COMMENT ON COLUMN maintenance.road_service_tickets.expense_id IS
  'LEAD 443.129 A (AJK-02): the expense a card- or advance-paid ticket produced (vendor-invoice tickets keep bill_id).';
