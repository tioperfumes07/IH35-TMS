-- LEAD 443.319 · escrow holder integrity.
-- accounting.escrow_accounts.holder_id is polymorphic (driver / vendor / factor) and carries no FK, so deleting a driver or
-- vendor silently orphaned its escrow account: measured 10-24, 11 USMCA driver escrow accounts pointed at drivers that no
-- longer existed (coder test drivers removed before the audited purge engine) and showed "Driver — Not Visible".
-- OWNER 10-24 12:16 PM CT: an escrow with a balance must always be visible with its holder. Drivers are made INACTIVE, never
-- deleted out from under their escrow. This trigger refuses the delete while any escrow account still points at the row;
-- a purge must remove (or reassign) the escrow account first, where the $0-balance check lives.
-- Idempotent, additive only (CREATE OR REPLACE function; triggers created only if absent). No data change.
BEGIN;

CREATE OR REPLACE FUNCTION accounting.refuse_holder_delete_with_escrow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
    FROM accounting.escrow_accounts ea
   WHERE ea.holder_id = OLD.id
     AND ea.operating_company_id = OLD.operating_company_id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'escrow_holder_delete_refused: % %.% still has % escrow account(s) — make the holder inactive, or remove the escrow account first',
      TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, OLD.id, OLD.operating_company_id, v_count
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END
$fn$;

DO $trg$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_refuse_driver_delete_with_escrow'
                 AND tgrelid = 'mdata.drivers'::regclass) THEN
    CREATE TRIGGER trg_refuse_driver_delete_with_escrow
      BEFORE DELETE ON mdata.drivers
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_holder_delete_with_escrow();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_refuse_vendor_delete_with_escrow'
                 AND tgrelid = 'mdata.vendors'::regclass) THEN
    CREATE TRIGGER trg_refuse_vendor_delete_with_escrow
      BEFORE DELETE ON mdata.vendors
      FOR EACH ROW EXECUTE FUNCTION accounting.refuse_holder_delete_with_escrow();
  END IF;
END
$trg$;

COMMIT;
