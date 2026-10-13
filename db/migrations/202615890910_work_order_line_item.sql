-- WO -> bill line account = its ITEM's account (CC-3, 443.132 standing orders; follow-up found by the 443.129 lanes).
-- A work-order line names the catalog item it bills, so the bill copy takes that item's account (443.67 G3: line account =
-- item account unless item_account_override_reason) instead of guessing a maintenance category from the line's
-- description keywords. work_order_lines carries no operating_company_id, so the FK is plain; the engine refuses an item
-- of another company (the item's company must equal the work order's).
ALTER TABLE maintenance.work_order_lines ADD COLUMN IF NOT EXISTS item_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_order_lines_item_id_fkey') THEN
    ALTER TABLE maintenance.work_order_lines
      ADD CONSTRAINT work_order_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES catalogs.items (id) NOT VALID;
    ALTER TABLE maintenance.work_order_lines VALIDATE CONSTRAINT work_order_lines_item_id_fkey;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS work_order_lines_item_id_idx ON maintenance.work_order_lines (item_id) WHERE item_id IS NOT NULL;

COMMENT ON COLUMN maintenance.work_order_lines.item_id IS
  'The catalog item this work-order line bills; the WO->bill copy takes the item''s default expense account (no description-keyword guess).';
