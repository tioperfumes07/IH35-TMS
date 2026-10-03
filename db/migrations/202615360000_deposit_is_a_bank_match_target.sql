-- 202615360000_deposit_is_a_bank_match_target.sql
-- CC-1 · ROUND 373.4 / 369.4 — THE DEPOSIT IS THE FIFTH STEP OF THE ACCRUAL CHAIN, AND THE BANK FEED CAN NOW MATCH TO IT.
--
-- The chain: load (Dr 1150 / Cr 4000) -> invoice (A/R) -> receive payment (Undeposited Funds 1090) -> DEPOSIT
-- (Dr bank / Cr 1090) -> the bank line matches the deposit. Four steps worked. The Deposit document exists (ROUND 312:
-- accounting.deposits + deposit_lines, Make Deposit page, posts Dr bank / Cr 1090 at creation through the engine) but
-- the bank feed had no way to match a deposit line to it — measured on prod 2026-10-03: banking.bank_transactions has 13
-- matched_* columns and none for a deposit; banking.reconciliation_matches.ledger_entry_kind admits no 'deposit'. So the
-- match invented the deposit (sweepMatchedReceiptToBank, ruled against in LAW 363.6 / 369.4) and the rest was written
-- by hand (the $166,868.94 manual entry the Lead named). Production holds 0 deposits.
--
-- This migration makes a Deposit a first-class match target. The match LINKS and posts nothing — the deposit already
-- posted when it was created (QuickBooks: the bank line matches a deposit that already exists).
--   * banking.bank_transactions.matched_deposit_id -> accounting.deposits(id), indexed
--   * banking.reconciliation_matches.ledger_entry_kind admits 'deposit'
--   * CC-2's ROUND 368.2(b) / ROUND 360 functions are restated from PRODUCTION'S LIVE DEFINITIONS (pg_get_functiondef,
--     direct endpoint, 2026-10-03), each changed by exactly one item — the deposit link — so a deposit-matched line is
--     "linked" (num_nonnulls), classified, pointed at, checked for a dead link, and priced by the tristate amount.
-- Idempotent. No data change.
BEGIN;
SET LOCAL lock_timeout = '15s';

ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS matched_deposit_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_matched_deposit_id_fkey'
                   AND conrelid = 'banking.bank_transactions'::regclass) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_matched_deposit_id_fkey FOREIGN KEY (matched_deposit_id) REFERENCES accounting.deposits (id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS ix_bank_transactions_matched_deposit_id
  ON banking.bank_transactions (matched_deposit_id) WHERE matched_deposit_id IS NOT NULL;
COMMENT ON COLUMN banking.bank_transactions.matched_deposit_id IS
  'ROUND 373.4: the Deposit document (accounting.deposits) this bank deposit line is matched to. The match links; the deposit posted at creation.';

ALTER TABLE banking.reconciliation_matches DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;
ALTER TABLE banking.reconciliation_matches ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check
  CHECK (ledger_entry_kind = ANY (ARRAY['payment'::text, 'bill_payment'::text, 'transfer'::text, 'je'::text, 'expense'::text, 'load'::text, 'bill'::text, 'settlement'::text, 'driver_bill'::text, 'factoring_advance'::text, 'invoice'::text, 'fuel_transaction'::text, 'relay_fuel'::text, 'advance'::text, 'deposit'::text]));

CREATE OR REPLACE FUNCTION banking.reconciliation_matched_ledger_amount_cents(p_ledger_entry_kind text, p_ledger_entry_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_amount bigint;
BEGIN
  CASE p_ledger_entry_kind
    WHEN 'payment' THEN
      SELECT amount_cents INTO v_amount FROM accounting.payments WHERE id = p_ledger_entry_id;
    WHEN 'bill_payment' THEN
      SELECT amount_cents INTO v_amount FROM accounting.bill_payments WHERE id = p_ledger_entry_id;
    WHEN 'transfer' THEN
      SELECT amount_cents INTO v_amount FROM banking.transfers WHERE id = p_ledger_entry_id;
    WHEN 'je' THEN
      SELECT SUM(amount_cents) INTO v_amount FROM accounting.journal_entry_postings
       WHERE journal_entry_uuid = p_ledger_entry_id AND debit_or_credit = 'debit';
    WHEN 'expense' THEN
      SELECT total_amount_cents INTO v_amount FROM accounting.expenses WHERE id = p_ledger_entry_id;
    WHEN 'load' THEN
      SELECT rate_total_cents INTO v_amount FROM mdata.loads WHERE id = p_ledger_entry_id;
    WHEN 'bill' THEN
      SELECT amount_cents INTO v_amount FROM accounting.bills WHERE id = p_ledger_entry_id;
    WHEN 'settlement' THEN
      SELECT ROUND(net_pay * 100) INTO v_amount FROM driver_finance.driver_settlements WHERE id = p_ledger_entry_id;
    WHEN 'driver_bill' THEN
      SELECT gross_amount_cents INTO v_amount FROM driver_finance.driver_bills WHERE id = p_ledger_entry_id;
    WHEN 'factoring_advance' THEN
      SELECT advance_amount_cents INTO v_amount FROM accounting.factoring_advances WHERE id = p_ledger_entry_id;
    WHEN 'invoice' THEN
      SELECT total_cents INTO v_amount FROM accounting.invoices WHERE id = p_ledger_entry_id;
    WHEN 'fuel_transaction' THEN
      SELECT ROUND(total_cost * 100) INTO v_amount FROM fuel.fuel_transactions WHERE id = p_ledger_entry_id;
    WHEN 'relay_fuel' THEN
      SELECT total_amount_paid_cents INTO v_amount FROM integrations.relay_fuel_transactions WHERE id = p_ledger_entry_id;
    WHEN 'deposit' THEN
      SELECT amount_deposited_cents INTO v_amount FROM accounting.deposits WHERE id = p_ledger_entry_id;
    ELSE
      RAISE EXCEPTION 'reconciliation_matched_ledger_amount_cents: unhandled ledger_entry_kind "%" -- every value in the reconciliation_matches CHECK constraint must be handled here, never silently fall through', p_ledger_entry_kind
        USING ERRCODE = 'check_violation';
  END CASE;
  RETURN v_amount;
END;
$function$;

CREATE OR REPLACE FUNCTION banking.refuse_bank_line_matched_to_nothing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_voided timestamptz;
  v_dead text;
BEGIN
  -- Judge the row as it stands at COMMIT, not as this statement left it.
  SELECT voided_at INTO v_voided FROM banking.bank_transactions WHERE id = NEW.id;
  IF NOT FOUND OR v_voided IS NOT NULL THEN
    RETURN NULL;
  END IF;
  -- A line that carries no document may not keep a LIVE match row (release without retiring = the stale-row class).
  IF EXISTS (
       SELECT 1 FROM banking.bank_transactions bt
        WHERE bt.id = NEW.id
          AND NOT (num_nonnulls(bt.matched_advance_id, bt.matched_bill_id, bt.matched_bill_payment_id, bt.matched_expense_id,
                                bt.matched_factoring_advance_id, bt.matched_fuel_transaction_id, bt.matched_invoice_id,
                                bt.matched_journal_entry_id, bt.matched_load_id, bt.matched_payment_id,
                                bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id, bt.matched_deposit_id,
                                bt.linked_entity_id) > 0
                   OR bt.status IN ('split', 'transfer') OR bt.transfer_kind IS NOT NULL))
     AND EXISTS (
       SELECT 1 FROM banking.reconciliation_matches m
        WHERE m.bank_transaction_id = NEW.id AND m.voided_at IS NULL AND m.match_state IN ('auto_matched', 'user_matched'))
  THEN
    RAISE EXCEPTION 'bank line % was released but still holds a live match row', NEW.id
      USING ERRCODE = 'check_violation',
            HINT = 'Unmatch retires the line''s live match rows (voided, rejected) in the same transaction (ROUND 368.2(b)).';
  END IF;
  v_dead := banking.bank_line_dead_link(NEW.id);
  IF v_dead IS NOT NULL THEN
    RAISE EXCEPTION 'bank line % is matched to nothing: % names a document that is missing or no longer live', NEW.id, v_dead
      USING ERRCODE = 'check_violation',
            HINT = 'Release the line through the bank-line state machine (Undo / Unmatch) in the same transaction that voids its document (ROUND 368.2(b)).';
  END IF;
  RETURN NULL;
END
$function$;

CREATE OR REPLACE FUNCTION banking.bank_line_classify()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_linked boolean;
  v_excluded boolean;
  v_kind text;
BEGIN
  v_linked := num_nonnulls(
                NEW.matched_advance_id, NEW.matched_bill_id, NEW.matched_bill_payment_id, NEW.matched_expense_id,
                NEW.matched_factoring_advance_id, NEW.matched_fuel_transaction_id, NEW.matched_invoice_id,
                NEW.matched_journal_entry_id, NEW.matched_load_id, NEW.matched_payment_id,
                NEW.matched_relay_fuel_transaction_id, NEW.matched_settlement_id, NEW.matched_transfer_id, NEW.matched_deposit_id,
                NEW.linked_entity_id) > 0
              OR NEW.status IN ('split', 'transfer')
              OR NEW.transfer_kind IS NOT NULL;
  -- review_state is an OUTPUT of this function, so as an INPUT it counts only when the writer sets it in this statement
  -- (or on the one-time backfill, OLD.review_bucket IS NULL); its evidence is then kept in excluded_reason, so Undo of an
  -- exclude is "clear the reason" for every exclude path alike.
  v_excluded := NEW.excluded_reason IS NOT NULL OR NEW.skip_reason IS NOT NULL OR NEW.status = 'skipped'
                OR (NEW.review_state = 'excluded'
                    AND (TG_OP = 'INSERT' OR OLD.review_state IS DISTINCT FROM 'excluded' OR OLD.review_bucket IS NULL));
  IF v_excluded AND NEW.excluded_reason IS NULL AND NEW.skip_reason IS NULL AND NEW.status IS DISTINCT FROM 'skipped' THEN
    NEW.excluded_reason := 'excluded';
  END IF;

  IF v_linked THEN
    IF TG_OP = 'UPDATE' AND NEW.resolution_kind IS NOT NULL AND NEW.resolution_kind IS DISTINCT FROM OLD.resolution_kind THEN
      v_kind := NEW.resolution_kind;          -- the writer DECLARED how it got here (match -> matched, categorize -> added)
    ELSIF TG_OP = 'UPDATE' AND OLD.review_bucket = 'categorized' AND OLD.resolution_kind IS NOT NULL THEN
      v_kind := OLD.resolution_kind;          -- still linked: an unrelated write never re-labels the line
    ELSE
      v_kind := CASE
        WHEN NEW.matched_transfer_id IS NOT NULL OR NEW.transfer_kind IS NOT NULL OR NEW.status = 'transfer' THEN 'transfer'
        WHEN NEW.status = 'split' THEN 'split'
        WHEN NEW.status = 'categorized' OR NEW.categorization_gl_account_id IS NOT NULL OR NEW.coa_account_id IS NOT NULL THEN 'added'
        ELSE 'matched'
      END;
    END IF;
    NEW.review_bucket := 'categorized';
    NEW.resolution_kind := v_kind;
    NEW.review_state := 'matched';            -- compatibility echo: every existing reader treats 'matched' as resolved
  ELSIF v_excluded THEN
    NEW.review_bucket := 'excluded';
    NEW.resolution_kind := NULL;
    NEW.review_state := 'excluded';
  ELSE
    NEW.review_bucket := 'for_review';
    NEW.resolution_kind := NULL;
    NEW.review_state := 'for_review';
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION banking.bank_line_match_pointers(p jsonb)
 RETURNS TABLE(kind text, ledger_entry_id uuid)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT m.kind, (p ->> m.col)::uuid
    FROM (VALUES ('matched_load_id', 'load'), ('matched_bill_id', 'bill'), ('matched_settlement_id', 'settlement'),
                 ('matched_expense_id', 'expense'), ('matched_transfer_id', 'transfer'), ('matched_payment_id', 'payment'),
                 ('matched_bill_payment_id', 'bill_payment'), ('matched_journal_entry_id', 'je'),
                 ('matched_factoring_advance_id', 'factoring_advance'), ('matched_invoice_id', 'invoice'),
                 ('matched_fuel_transaction_id', 'fuel_transaction'), ('matched_relay_fuel_transaction_id', 'relay_fuel'),
                 ('matched_advance_id', 'advance'), ('matched_deposit_id', 'deposit')) AS m(col, kind)
   WHERE p ->> m.col IS NOT NULL
$function$;

CREATE OR REPLACE FUNCTION banking.bank_line_dead_link(p_line_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN bt.matched_bill_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.bills d WHERE d.id = bt.matched_bill_id AND d.voided_at IS NULL AND d.revoked_at IS NULL) THEN 'matched_bill_id'
    WHEN bt.matched_bill_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.bill_payments d WHERE d.id = bt.matched_bill_payment_id AND d.voided_at IS NULL AND d.revoked_at IS NULL) THEN 'matched_bill_payment_id'
    WHEN bt.matched_expense_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.expenses d WHERE d.id = bt.matched_expense_id AND d.voided_at IS NULL) THEN 'matched_expense_id'
    WHEN bt.matched_payment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.payments d WHERE d.id = bt.matched_payment_id AND d.voided_at IS NULL) THEN 'matched_payment_id'
    WHEN bt.matched_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.invoices d WHERE d.id = bt.matched_invoice_id AND d.voided_at IS NULL) THEN 'matched_invoice_id'
    WHEN bt.matched_transfer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM banking.transfers d WHERE d.id = bt.matched_transfer_id AND d.revoked_at IS NULL) THEN 'matched_transfer_id'
    WHEN bt.matched_journal_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries d WHERE d.id = bt.matched_journal_entry_id AND d.status = 'posted' AND d.reversed_by_je_id IS NULL AND d.voided_at IS NULL) THEN 'matched_journal_entry_id'
    WHEN bt.matched_load_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.loads d WHERE d.id = bt.matched_load_id AND d.voided_at IS NULL AND d.soft_deleted_at IS NULL) THEN 'matched_load_id'
    WHEN bt.matched_settlement_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_settlements d WHERE d.id = bt.matched_settlement_id AND d.voided_at IS NULL) THEN 'matched_settlement_id'
    WHEN bt.matched_advance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM driver_finance.driver_advances d WHERE d.id = bt.matched_advance_id AND d.voided_at IS NULL) THEN 'matched_advance_id'
    WHEN bt.matched_factoring_advance_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.factoring_advances d WHERE d.id = bt.matched_factoring_advance_id AND d.voided_at IS NULL) THEN 'matched_factoring_advance_id'
    WHEN bt.matched_fuel_transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fuel.fuel_transactions d WHERE d.id = bt.matched_fuel_transaction_id AND d.voided_at IS NULL) THEN 'matched_fuel_transaction_id'
    WHEN bt.matched_relay_fuel_transaction_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM integrations.relay_fuel_transactions d WHERE d.id = bt.matched_relay_fuel_transaction_id AND d.voided_at IS NULL) THEN 'matched_relay_fuel_transaction_id'
    WHEN bt.matched_deposit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.deposits d WHERE d.id = bt.matched_deposit_id AND d.voided_at IS NULL) THEN 'matched_deposit_id'
  END
  FROM banking.bank_transactions bt
  WHERE bt.id = p_line_id
$function$;

CREATE OR REPLACE FUNCTION banking.refuse_live_match_row_on_released_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_state text;
  v_row_voided timestamptz;
  v_line_ok boolean;
BEGIN
  SELECT match_state, voided_at INTO v_state, v_row_voided FROM banking.reconciliation_matches WHERE id = NEW.id;
  IF NOT FOUND OR v_row_voided IS NOT NULL OR v_state NOT IN ('auto_matched', 'user_matched') THEN
    RETURN NULL;
  END IF;
  SELECT bt.voided_at IS NULL
         AND (num_nonnulls(bt.matched_advance_id, bt.matched_bill_id, bt.matched_bill_payment_id, bt.matched_expense_id,
                           bt.matched_factoring_advance_id, bt.matched_fuel_transaction_id, bt.matched_invoice_id,
                           bt.matched_journal_entry_id, bt.matched_load_id, bt.matched_payment_id,
                           bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id, bt.matched_deposit_id,
                           bt.linked_entity_id) > 0
              OR bt.status IN ('split', 'transfer') OR bt.transfer_kind IS NOT NULL)
    INTO v_line_ok
    FROM banking.bank_transactions bt WHERE bt.id = NEW.bank_transaction_id;
  IF NOT COALESCE(v_line_ok, false) THEN
    RAISE EXCEPTION 'live match row % (% %) sits on bank line % which carries no document', NEW.id, NEW.ledger_entry_kind, NEW.ledger_entry_id, NEW.bank_transaction_id
      USING ERRCODE = 'check_violation',
            HINT = 'Unmatch retires the row (voided, rejected) in the same transaction it releases the line (ROUND 368.2(b)).';
  END IF;
  RETURN NULL;
END
$function$;

COMMIT;
