-- 202615410950_relay_wallet_consumed_only_by_relay_fill.sql  (CLAIM-RESERVE #25412, CC-3)
-- ACCT-F403 — Lead ruling (Option 1), from the owner's standing ruling "Relay is PREPAID … a Relay bank draft funds the card
-- balance rather than paying for specific fuel purchases." The Relay wallet (role fuel_wallet_relay, 1295 on USMCA) is a
-- prepaid ASSET. Three events, never collapsed:
--   1. top-up      Dr wallet       / Cr funding source   (transfer)
--   2. Relay fill  Dr fuel expense / Cr wallet           (at what Relay charged — the wallet line, matched in Banking)
--   3. the AlwaysTrack settlement line LINKS to the fill and posts NO fuel (it is a driver-facing figure, not company cost).
-- Measured 2026-10-04 on USMCA: 101 postings credited the wallet from settlement-derived expense documents ($36,067.97) and
-- no top-up was ever booked, so the asset sat at -$33,839.80; 44 of the 69 Relay wallet lines are the same physical fill as a
-- settlement-fed fuel row (same unit, day +-1, gallons) at a different amount (Relay $24,217.49 vs settlement $26,816.71).
--
-- (1) fuel.fuel_transactions.relay_fuel_transaction_id — the settlement fuel row's link to the Relay fill it describes.
-- (2) A CREDIT to the wallet is refused unless it is the Relay fill itself (a fuel_event posting whose source is an
--     integrations.relay_fuel_transactions row) or a reversal line. Debits (top-ups, reversals of the old credits) pass.
-- Writes NO rows. Fresh-DB safe. Idempotent.
BEGIN;
SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS relay_fuel_transaction_id uuid NULL REFERENCES integrations.relay_fuel_transactions(id);
CREATE INDEX IF NOT EXISTS idx_fuel_tx_relay_fuel_transaction_id
  ON fuel.fuel_transactions (relay_fuel_transaction_id) WHERE relay_fuel_transaction_id IS NOT NULL;
COMMENT ON COLUMN fuel.fuel_transactions.relay_fuel_transaction_id IS
  'ACCT-F403: the Relay fill this settlement-derived fuel row describes. A linked row posts no fuel; the fill posts, at Relay''s charge.';

CREATE OR REPLACE FUNCTION accounting.refuse_relay_wallet_credit_not_from_relay_fill() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
BEGIN
  IF NEW.debit_or_credit <> 'credit' OR NEW.reversal_of_line_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r
                  WHERE r.account_id = NEW.account_id AND r.is_active AND r.role = 'fuel_wallet_relay') THEN
    RETURN NEW;
  END IF;
  IF NEW.source_transaction_type = 'fuel_event'
     AND EXISTS (SELECT 1 FROM integrations.relay_fuel_transactions rf WHERE rf.id::text = NEW.source_transaction_id::text) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'relay_wallet_consumed_only_by_a_relay_fill'
    USING ERRCODE = '23514',
          DETAIL = format('a %s posting (%s %s) tried to credit the Relay wallet; only a Relay fill consumes the prepaid balance',
                          COALESCE(NEW.source_transaction_type, 'sourceless'), COALESCE(NEW.source_transaction_type, '-'),
                          COALESCE(NEW.source_transaction_id::text, '-')),
          HINT = 'A settlement fuel line links to its Relay fill (fuel.fuel_transactions.relay_fuel_transaction_id) and posts no fuel; the fill posts when its wallet line is matched in Banking.';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_relay_wallet_consumed_only_by_relay_fill ON accounting.journal_entry_postings;
CREATE TRIGGER trg_relay_wallet_consumed_only_by_relay_fill
  BEFORE INSERT ON accounting.journal_entry_postings
  FOR EACH ROW EXECUTE FUNCTION accounting.refuse_relay_wallet_credit_not_from_relay_fill();

COMMIT;
