-- 202615370600_fuel_purchase_unique_per_provider_transaction.sql
-- ROUND 367.2 / 367.8 (CC-2) — PERMANENT: one provider transaction is one fuel purchase. The database refuses a second
-- live copy, so no writer (present, future, or a seed that keys on the load) can record and post it twice again.
-- Spec: docs/bus/10-03-2026-ALL-SEATS-ROUND-367-EXPENSES-SCREEN-AND-DUPLICATE-PATH.md
--
-- Cause (measured on USMCA, direct endpoint): the settlement seed hashed (company, LOAD, date, vendor, invoice), so the
-- same AlwaysTrack invoice printed on two drivers' settlements for two loads got two hashes and fuel_tx_source_row_hash_uk
-- never fired. Three purchases are recorded and posted twice: 99530579 (510.61), 1848853 (585.36), 99794138 (1,005.59).
--
-- The key: (operating_company_id, vendor_id, btrim(transaction_reference)) among rows with voided_at IS NULL, and ONLY
-- when the reference is the provider's number (digits only). 65 USMCA rows carry a reference that is not a provider key
-- (DEF-<load>-n / nofuelinv-* placeholders, parse fragments) and are not deduplicated on.
--
-- A trigger, not a unique index: the three existing pairs would make CREATE UNIQUE INDEX fail, and they are real posted
-- money that only the owner may reverse and void (AUTH). The trigger judges every NEW write (insert, re-reference, vendor
-- change, un-void); it never touches an existing row, so voiding one of the three pairs is still allowed. An advisory
-- transaction lock on the key closes the race between two concurrent inserts.
-- This migration writes NO rows.

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
    'fuel_provider_txn:' || NEW.operating_company_id::text || ':' || COALESCE(NEW.vendor_id::text, '-') || ':' || v_ref, 0));

  SELECT f.id, l.load_number INTO v_existing
    FROM fuel.fuel_transactions f
    LEFT JOIN mdata.loads l ON l.id = f.load_id
   WHERE f.operating_company_id = NEW.operating_company_id
     AND f.vendor_id IS NOT DISTINCT FROM NEW.vendor_id
     AND btrim(f.transaction_reference) = v_ref
     AND f.voided_at IS NULL
     AND f.id <> NEW.id
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'fuel_provider_transaction_already_recorded:%', v_ref
      USING ERRCODE = '23505',
            DETAIL = format('fuel transaction %s (load %s) already records provider transaction %s for this company and vendor',
                            v_existing.id, COALESCE(v_existing.load_number, 'none'), v_ref),
            HINT = 'One provider transaction is one purchase. Open the existing row; if it is wrong, reverse and void it first.';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Serves the lookup above and the writers' pre-check (findLiveFuelByProviderTransactionId).
CREATE INDEX IF NOT EXISTS idx_fuel_tx_live_provider_reference
  ON fuel.fuel_transactions (operating_company_id, vendor_id, (btrim(transaction_reference)))
  WHERE voided_at IS NULL;

DROP TRIGGER IF EXISTS trg_fuel_refuse_duplicate_provider_transaction ON fuel.fuel_transactions;
CREATE TRIGGER trg_fuel_refuse_duplicate_provider_transaction
  BEFORE INSERT OR UPDATE OF transaction_reference, vendor_id, voided_at, operating_company_id
  ON fuel.fuel_transactions
  FOR EACH ROW EXECUTE FUNCTION fuel.refuse_duplicate_provider_transaction();

COMMIT;
