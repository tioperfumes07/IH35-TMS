-- 202615410940_relay_posted_to_gl_is_derived.sql  (CLAIM-RESERVE #25398, CC-3)
-- integrations.relay_fuel_transactions.posted_to_gl is a DERIVED fact — a Relay fill is posted when its bank line is
-- matched and carries a journal entry (fuel/relay-fills.routes.ts derives it that way; the posting engine is
-- postFuelFillOnBankMatch). The stored column was flipped by markRelayPostedToGl after a fuel-event post keyed on the
-- R43-retired fuel.fuel_transactions bridge, so the flag outlived every JE behind it.
-- Measured 2026-10-04 on USMCA (bypass, read-only): 75 rows posted_to_gl = true, 75 with no journal_entry_postings row
-- sourcing to them (verify-fuel-card-gl-subledger-traceability: 75 flagged, 0 traceable).
--
-- (1) USMCA only (TRANSPORTATION / TRUCKING are frozen): a true flag with no posting behind it is cleared.
-- (2) The database refuses a stored true from here on — nothing may claim "posted" in a column; readers derive it.
-- Idempotent. Fresh-DB safe (no USMCA rows -> the UPDATE matches nothing).
BEGIN;
SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

UPDATE integrations.relay_fuel_transactions r
   SET posted_to_gl = false, updated_at = now()
 WHERE r.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND r.posted_to_gl
   AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.source_transaction_id::text = r.id::text);

CREATE OR REPLACE FUNCTION integrations.refuse_relay_posted_to_gl_stored_true() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF NEW.posted_to_gl AND (TG_OP = 'INSERT' OR OLD.posted_to_gl IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'relay_posted_to_gl_is_derived'
      USING ERRCODE = '23514',
            DETAIL = format('relay fuel transaction %s: posted is derived from its matched bank line''s journal entry, never stored', NEW.id),
            HINT = 'Match the bank line in Banking (postFuelFillOnBankMatch posts it); read posted from the ledger.';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_relay_posted_to_gl_is_derived ON integrations.relay_fuel_transactions;
CREATE TRIGGER trg_relay_posted_to_gl_is_derived
  BEFORE INSERT OR UPDATE OF posted_to_gl ON integrations.relay_fuel_transactions
  FOR EACH ROW EXECUTE FUNCTION integrations.refuse_relay_posted_to_gl_stored_true();

COMMIT;
