-- SCENTSX — one vendor, many price lists. Owner 2026-11-27 18:38 CT: "fix that rule a vendor can have multiple lists".
--
-- WHY. scentsx.vendor_links tied ONE perfume price list to ONE ScentsX A/P vendor (uq_scentsx_vendor_links_vendor). A company
-- sends more than one list (Elegance Distributors + its ARABIC list, Perfumes Plus Wholesale + its BLACK FRIDAY list, United
-- Perfumes B2B + Panama export), and since 2026-11-27 every list belongs to its company (perfume.vendors.company_id, one company
-- record). The second list's purchase orders could not be billed: its ScentsX vendor was already taken.
--
-- RULE NOW. A list still has at most one live ScentsX vendor (uq_scentsx_vendor_links_perfume stays). A ScentsX vendor may be
-- linked to several lists ONLY when all of them belong to the SAME company in Contacts (both company_id set and equal) — two
-- different companies can never share one A/P vendor. Enforced by trigger (a unique index cannot say "same company").
BEGIN;

DROP INDEX IF EXISTS scentsx.uq_scentsx_vendor_links_vendor;
CREATE INDEX IF NOT EXISTS ix_scentsx_vendor_links_vendor ON scentsx.vendor_links (vendor_id) WHERE voided_at IS NULL;

CREATE OR REPLACE FUNCTION scentsx.vendor_link_one_company() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog, scentsx, perfume
AS $$
DECLARE
  v_new uuid;
BEGIN
  IF NEW.voided_at IS NOT NULL THEN RETURN NEW; END IF;
  -- Serialize links to the same ScentsX vendor so two inserts cannot both pass the check.
  PERFORM pg_advisory_xact_lock(hashtextextended('scentsx.vendor_links:' || NEW.vendor_id::text, 0));
  SELECT company_id INTO v_new FROM perfume.vendors WHERE id = NEW.perfume_vendor_id;
  IF EXISTS (
    SELECT 1 FROM scentsx.vendor_links l JOIN perfume.vendors pv ON pv.id = l.perfume_vendor_id
     WHERE l.vendor_id = NEW.vendor_id AND l.voided_at IS NULL AND l.id IS DISTINCT FROM NEW.id
       AND (v_new IS NULL OR pv.company_id IS NULL OR pv.company_id <> v_new)
  ) THEN
    RAISE EXCEPTION 'this ScentsX vendor is already linked to a price list of another company — one A/P vendor serves only the lists of one company'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vendor_links_one_company ON scentsx.vendor_links;
CREATE TRIGGER trg_vendor_links_one_company BEFORE INSERT OR UPDATE OF vendor_id, perfume_vendor_id, voided_at ON scentsx.vendor_links
  FOR EACH ROW EXECUTE FUNCTION scentsx.vendor_link_one_company();

COMMIT;
