-- SCENTSX item account mapping — owner 2026-11-27 08:10 CT "all must be fully wired … mechanical economic financial and money wiring etc
-- chart of accounts liabilities assets ap ar balances etc".
--
-- QuickBooks / NetSuite give every inventory item its own Inventory Asset and COGS account. ScentsX does it by item category (Perfume,
-- Cosmetics, Hair care, Skincare …) with an optional override on one item. The stock-move poster (reused — same amounts, same debit /
-- credit pairs) takes the item's Inventory account where it used role 'inventory_asset' and the item's COGS account where it used role
-- 'cogs_goods'; with no mapping it keeps the role accounts (1200 Inventory / 5000 Cost of Goods Sold), so nothing changes until the owner
-- maps a category. The inventory tie-out adds up every inventory account the map ever named plus the role account.
--
-- One row per scope: scope 'category' (item_category catalog value, by text) or scope 'item' (perfume.items). Changing a mapping archives
-- the row and inserts a new one, so the rows are the history. Accounts must be ScentsX's: the inventory account an Asset of subtype
-- Inventory, the COGS account of type CostOfGoodsSold (trigger). The service refuses to move an inventory account while the items it
-- covers have stock on hand (the value already on the old account would be stranded — reclass first).

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.item_account_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  scope text NOT NULL CHECK (scope IN ('category', 'item')),
  category text,
  item_id uuid REFERENCES perfume.items(id),
  inventory_account_id uuid REFERENCES catalogs.accounts(id),
  cogs_account_id uuid REFERENCES catalogs.accounts(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  archived_by uuid REFERENCES identity.users(id),
  CHECK ((scope = 'category' AND category IS NOT NULL AND length(btrim(category)) BETWEEN 1 AND 60 AND item_id IS NULL)
      OR (scope = 'item' AND item_id IS NOT NULL AND category IS NULL)),
  CHECK (inventory_account_id IS NOT NULL OR cogs_account_id IS NOT NULL),
  CHECK (archived_at IS NULL OR archived_by IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_item_account_map_category
  ON scentsx.item_account_map (operating_company_id, lower(btrim(category))) WHERE scope = 'category' AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_item_account_map_item
  ON scentsx.item_account_map (operating_company_id, item_id) WHERE scope = 'item' AND archived_at IS NULL;

-- Wall + account rules.
CREATE OR REPLACE FUNCTION scentsx.check_item_account_map() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, org, catalogs
AS $$
DECLARE
  v_sx uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
  a record;
BEGIN
  IF v_sx IS NULL OR NEW.operating_company_id IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION 'item_account_map row must belong to SCENTSX' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.inventory_account_id IS NOT NULL THEN
    SELECT operating_company_id, account_type, account_subtype, deactivated_at, is_postable INTO a FROM catalogs.accounts WHERE id = NEW.inventory_account_id;
    IF a.operating_company_id IS DISTINCT FROM v_sx OR a.account_type <> 'Asset' OR a.account_subtype <> 'Inventory'
       OR a.deactivated_at IS NOT NULL OR a.is_postable IS FALSE THEN
      RAISE EXCEPTION 'the inventory account must be an active, postable ScentsX Asset account of subtype Inventory' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.cogs_account_id IS NOT NULL THEN
    SELECT operating_company_id, account_type, deactivated_at, is_postable INTO a FROM catalogs.accounts WHERE id = NEW.cogs_account_id;
    IF a.operating_company_id IS DISTINCT FROM v_sx OR a.account_type <> 'CostOfGoodsSold' OR a.deactivated_at IS NOT NULL OR a.is_postable IS FALSE THEN
      RAISE EXCEPTION 'the COGS account must be an active, postable ScentsX Cost of Goods Sold account' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_scentsx_item_account_map_check ON scentsx.item_account_map;
CREATE TRIGGER trg_scentsx_item_account_map_check BEFORE INSERT OR UPDATE ON scentsx.item_account_map
  FOR EACH ROW EXECUTE FUNCTION scentsx.check_item_account_map();

ALTER TABLE scentsx.item_account_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.item_account_map FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_account_map_entity_select ON scentsx.item_account_map;
DROP POLICY IF EXISTS item_account_map_entity_write ON scentsx.item_account_map;
CREATE POLICY item_account_map_entity_select ON scentsx.item_account_map FOR SELECT
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY item_account_map_entity_write ON scentsx.item_account_map FOR ALL
  USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])));
GRANT SELECT, INSERT, UPDATE ON scentsx.item_account_map TO ih35_app;

COMMIT;
