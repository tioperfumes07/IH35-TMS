-- FINDING: ACCT-F11112 — a closed fuel card still takes new fuel rows.
--
-- OWNER 2026-11-09 18:56 CT: "before october 9 we are using relay, dreamline"; 18:57 CT: "yes, we had the account
-- canceled" (Dreamline). From 2026-10-09 USMCA fuels on WEX (card payable 2520). Nothing in the fuel ingest knew a card
-- rail had an end date: a Settlement Creator receipt, the office form, the fleet-card import or a Dreamline statement
-- re-run could still write a DREAMLINE fuel row dated after the account closed, posting Dr fuel / Cr 2510 on a card that
-- no longer exists (the Oct-2026 DREAMLINE rows that triggered this are all dated 10-01..10-07 — 11 rows, $3,669.43 —
-- and stay as they are: history is never rewritten).
--
-- FIX (QuickBooks "make inactive", effective-dated; history stays):
--   - catalogs.fuel_card_types.metadata->>'inactive_from' (YYYY-MM-DD, company time zone) is the card rail's last-day+1.
--   - fuel.refuse_fuel_on_inactive_card(): BEFORE INSERT / UPDATE OF fuel_card_id, transaction_at on
--     fuel.fuel_transactions — a LIVE row (voided_at NULL) whose card rail is inactive on the fill's Central date is
--     refused with SQLSTATE 'P0001' and the message prefix 'fuel_card_inactive' (the writer surfaces it; the
--     statement engine lists such lines for review instead of writing them).
--   - A row already on the books is never touched: an UPDATE that keeps the card and the date is not re-checked, and a
--     void (voided_at set) is always allowed.
-- The effective date itself is DATA (set per company through the audited catalog write), not hard-coded here.
--
-- IDEMPOTENT: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

BEGIN;

CREATE OR REPLACE FUNCTION fuel.refuse_fuel_on_inactive_card()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_inactive_from date;
  v_code text;
  v_fill_date date;
BEGIN
  IF NEW.voided_at IS NOT NULL OR NEW.fuel_card_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.fuel_card_id IS NOT DISTINCT FROM OLD.fuel_card_id
     AND NEW.transaction_at IS NOT DISTINCT FROM OLD.transaction_at
     AND OLD.voided_at IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT NULLIF(ct.metadata ->> 'inactive_from', '')::date, ct.code
    INTO v_inactive_from, v_code
    FROM catalogs.fuel_card_types ct
   WHERE ct.id = NEW.fuel_card_id;
  IF v_inactive_from IS NULL THEN
    RETURN NEW;
  END IF;
  v_fill_date := (COALESCE(NEW.transaction_at, NEW.purchased_at) AT TIME ZONE 'America/Chicago')::date;
  IF v_fill_date >= v_inactive_from THEN
    RAISE EXCEPTION 'fuel_card_inactive: the % fuel card is inactive from % (fill dated %) — record this fill on the card it was bought on',
      v_code, v_inactive_from, v_fill_date
      USING ERRCODE = 'P0001', HINT = 'catalogs.fuel_card_types.metadata.inactive_from';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fuel.refuse_fuel_on_inactive_card() IS
  'ACCT-F11112: a live fuel row may not be written on a card rail whose metadata.inactive_from is on/before the fill''s Central date (owner 2026-11-09: Dreamline account canceled; WEX from 2026-10-09).';

DROP TRIGGER IF EXISTS trg_refuse_fuel_on_inactive_card ON fuel.fuel_transactions;
CREATE TRIGGER trg_refuse_fuel_on_inactive_card
  BEFORE INSERT OR UPDATE OF fuel_card_id, transaction_at, voided_at ON fuel.fuel_transactions
  FOR EACH ROW EXECUTE FUNCTION fuel.refuse_fuel_on_inactive_card();

COMMIT;
