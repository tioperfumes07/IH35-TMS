-- 202615410930_fuel_provider_transaction_unique_per_product_line.sql  (CLAIM-RESERVE #25393, CC-3)
-- One provider transaction is one purchase PER PRODUCT LINE. 202615370600 keyed a purchase on (company, vendor, receipt)
-- and ignored the product, but a Love's ticket prints diesel, DEF and reefer fuel as separate lines under ONE receipt.
-- Measured 2026-10-04 on USMCA: the signed settlements 5770 / 5794 print DEF on the same receipt as the diesel fill
-- (99301244, 99442334, 99602755, 99912182). The trigger refused every such DEF ("fuel_provider_transaction_already_recorded"),
-- and the app pre-check findLiveFuelByProviderTransactionId returned the DIESEL row for a same-load DEF, silently merging
-- the DEF away — a lost cost on every re-feed after the purge.
--
-- The key becomes (operating_company_id, vendor_id, btrim(transaction_reference), fuel_type) among live rows. Every
-- duplicate this rule was written for (99530579, 1848853, 99794138) was the SAME product twice, so it still refuses them.
-- The trigger now also fires on a fuel_type change. This migration writes NO rows. Fresh-DB safe.
BEGIN;
SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION fuel.refuse_duplicate_provider_transaction() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_ref text := btrim(NEW.transaction_reference);
  v_existing record;
BEGIN
  IF NEW.voided_at IS NOT NULL OR v_ref IS NULL OR v_ref !~ '^[0-9]+$' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'fuel_provider_txn:' || NEW.operating_company_id::text || ':' || COALESCE(NEW.vendor_id::text, '-') || ':' || v_ref
      || ':' || COALESCE(NEW.fuel_type::text, '-'), 0));
  SELECT f.id, l.load_number INTO v_existing
    FROM fuel.fuel_transactions f
    LEFT JOIN mdata.loads l ON l.id = f.load_id
   WHERE f.operating_company_id = NEW.operating_company_id
     AND f.vendor_id IS NOT DISTINCT FROM NEW.vendor_id
     AND btrim(f.transaction_reference) = v_ref
     AND f.fuel_type IS NOT DISTINCT FROM NEW.fuel_type
     AND f.voided_at IS NULL
     AND f.id <> NEW.id
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'fuel_provider_transaction_already_recorded:%', v_ref
      USING ERRCODE = '23505',
            DETAIL = format('fuel transaction %s (load %s) already records provider transaction %s (%s) for this company and vendor',
                            v_existing.id, COALESCE(v_existing.load_number, 'none'), v_ref, COALESCE(NEW.fuel_type::text, 'no product')),
            HINT = 'One provider transaction is one purchase per product line. Open the existing row; if it is wrong, reverse and void it first.';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE INDEX IF NOT EXISTS idx_fuel_tx_live_provider_reference_product
  ON fuel.fuel_transactions (operating_company_id, vendor_id, (btrim(transaction_reference)), fuel_type)
  WHERE voided_at IS NULL;
DROP INDEX IF EXISTS fuel.idx_fuel_tx_live_provider_reference;

DROP TRIGGER IF EXISTS trg_fuel_refuse_duplicate_provider_transaction ON fuel.fuel_transactions;
CREATE TRIGGER trg_fuel_refuse_duplicate_provider_transaction
  BEFORE INSERT OR UPDATE OF transaction_reference, vendor_id, voided_at, operating_company_id, fuel_type
  ON fuel.fuel_transactions
  FOR EACH ROW EXECUTE FUNCTION fuel.refuse_duplicate_provider_transaction();

COMMIT;
