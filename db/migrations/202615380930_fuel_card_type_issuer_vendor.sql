-- 202615380930_fuel_card_type_issuer_vendor.sql  (CLAIM-RESERVE #24857, CC-3)
-- ROUND 381.6 — the Fuel Cards registry (fuel:cards) requires a VENDOR link and had none: a card knew its truck, its
-- driver and its card type, but not who issued it. Owner ruling 2026-10-02: Relay and Dreamline are bank / credit-card
-- accounts — their ISSUER is a vendor (USMCA carries "Relay Purchases" and "Dreamline Transit LLC").
--
-- The issuer belongs to the card TYPE (every Relay card is issued by Relay), so the link lives on
-- catalogs.fuel_card_types. NULLABLE and NOT bound here: which vendor issues a card type is the owner's designation on the
-- Fuel Cards page, never a name match in a migration (ROUND 365.1). A vendor of another company is refused by the
-- database (an FK check bypasses RLS, and an Owner session sees every company).

BEGIN;

ALTER TABLE catalogs.fuel_card_types
  ADD COLUMN IF NOT EXISTS issuer_vendor_id uuid REFERENCES mdata.vendors(id);

CREATE INDEX IF NOT EXISTS ix_fuel_card_types_issuer_vendor_id
  ON catalogs.fuel_card_types (issuer_vendor_id) WHERE issuer_vendor_id IS NOT NULL;

COMMENT ON COLUMN catalogs.fuel_card_types.issuer_vendor_id IS
  'ROUND 381.6: the vendor that issues this card type (Relay, Dreamline). Owner-designated on the Fuel Cards page; same company only.';

CREATE OR REPLACE FUNCTION catalogs.refuse_fuel_card_type_foreign_issuer() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.issuer_vendor_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM mdata.vendors v
                  WHERE v.id = NEW.issuer_vendor_id AND v.operating_company_id = NEW.operating_company_id) THEN
    RAISE EXCEPTION 'fuel card type %: issuer vendor % is not a vendor of company %', NEW.id, NEW.issuer_vendor_id, NEW.operating_company_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_fuel_card_type_issuer_same_company ON catalogs.fuel_card_types;
CREATE TRIGGER trg_fuel_card_type_issuer_same_company
  BEFORE INSERT OR UPDATE OF issuer_vendor_id, operating_company_id ON catalogs.fuel_card_types
  FOR EACH ROW EXECUTE FUNCTION catalogs.refuse_fuel_card_type_foreign_issuer();

COMMIT;
