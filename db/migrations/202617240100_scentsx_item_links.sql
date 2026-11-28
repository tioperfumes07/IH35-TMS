-- SCENTSX M21 (LEAD ROUND L.32, owner 2026-11-27 19:38 CT "distribute work … all fully completely done"): Items → books.
-- Each perfume item (perfume.items, the desk's item master) becomes a ScentsX product in the engine's Products & Services
-- (catalogs.items: income account, COGS account) through ONE live link per item. The inventory and COGS accounts the stock moves
-- post to stay in scentsx.item_account_map (202617050100, by category: 1201–1204 / 5001–5004); the income account is the
-- sales channel's (4000 wholesale / 4010 retail / 4020 export) at invoice time.
--
-- Measured on production 2026-11-28 02:15 UTC: perfume.items live = 31,385 (all Stock item Y, active); catalogs.items for ScentsX = 9;
-- no link existed. ScentsX accounts 1201–1204, 4000/4010/4020, 5001–5004 exist and are postable.
--
-- CANONICAL-CHECK: item_crosswalk. scentsx.item_links is NOT a second item master and NOT a money table: it posts nothing and holds
--   no price, account or balance. It is a crosswalk row (perfume.items ↔ catalogs.items), the way scentsx.customer_links /
--   vendor_links cross perfume companies to mdata.customers / mdata.vendors (202616840100). The product lives ONLY in the canonical
--   catalogs.items (written by the one catalog-item writer) and its accounts in catalogs.accounts.

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.item_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  perfume_item_id uuid NOT NULL REFERENCES perfume.items(id),
  catalog_item_id uuid NOT NULL REFERENCES catalogs.items(id),
  voided_at timestamptz,
  void_reason text,
  voided_by uuid REFERENCES identity.users(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (voided_at IS NULL OR length(btrim(coalesce(void_reason, ''))) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_item_links_perfume ON scentsx.item_links (perfume_item_id) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_item_links_catalog ON scentsx.item_links (catalog_item_id) WHERE voided_at IS NULL;

-- Entity wall: the link and the product it names are SCENTSX's (a product of another company is refused).
CREATE OR REPLACE FUNCTION scentsx.refuse_non_scentsx_item_link() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, org, catalogs
AS $$
DECLARE
  v_sx uuid := (SELECT id FROM org.companies WHERE code = 'SCENTSX');
BEGIN
  IF v_sx IS NULL OR NEW.operating_company_id IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION 'scentsx.item_links row must belong to SCENTSX' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT operating_company_id FROM catalogs.items WHERE id = NEW.catalog_item_id) IS DISTINCT FROM v_sx THEN
    RAISE EXCEPTION 'scentsx.item_links: the product must be a SCENTSX catalogs.items row' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION scentsx.refuse_non_scentsx_item_link() FROM PUBLIC;
DROP TRIGGER IF EXISTS trg_item_links_scentsx_wall ON scentsx.item_links;
CREATE TRIGGER trg_item_links_scentsx_wall BEFORE INSERT OR UPDATE OF operating_company_id, catalog_item_id ON scentsx.item_links
  FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_item_link();

ALTER TABLE scentsx.item_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.item_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_links_entity_select ON scentsx.item_links;
DROP POLICY IF EXISTS item_links_entity_write ON scentsx.item_links;
CREATE POLICY item_links_entity_select ON scentsx.item_links FOR SELECT
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY item_links_entity_write ON scentsx.item_links FOR ALL
  USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])));
GRANT SELECT, INSERT, UPDATE ON scentsx.item_links TO ih35_app;

COMMIT;
