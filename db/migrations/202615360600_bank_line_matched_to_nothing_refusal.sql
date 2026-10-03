-- 202615360600_bank_line_matched_to_nothing_refusal.sql
-- ROUND 368.2(b) (CC-2) — PERMANENT: a bank line may not sit matched to nothing. The database refuses it, so no code path
-- (present, future, or written by a seat who never read this) can produce it again.
-- Spec: docs/bus/10-03-2026-ALL-SEATS-ROUND-368-PRIORITY-CHANGE-RECLASSIFY-FIRST-AND-THE-TWO-PERMANENT-REFUSALS.md
--
-- Two sides, checked at COMMIT (CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED, the trg_live_posting_keeps_spine_link
-- shape), so a transition that releases the line and voids its document inside one transaction is judged on its END
-- state, never mid-way:
--   1. banking.bank_transactions — a live line whose matched_* names a document: that document EXISTS and is LIVE
--      (not voided / revoked / reversed / soft-deleted). Four of the 13 columns carry no FK at all (bill, settlement,
--      fuel, relay fill); none of the 13 FKs says "live". (The bucket <-> link agreement is already refused per statement
--      by chk_bank_line_bucket_matches_link, 202615350600 — the 29-line "matched with nothing" class.)
--      and a live line that carries NO document holds no LIVE match row (release without retiring).
--   2. banking.reconciliation_matches — a LIVE match row (auto / user, unvoided) sits on a live bank line that still
--      carries a document. The stale-row class (75 retired by 202615350600) can never be written again.
--   3. the 13 document tables — a document whose transition makes it NOT live (or a delete) while a live bank line still
--      names it. (The idx_bank_transactions_matched_load index already exists; the other 12 partial indexes are new.)
-- linked_entity_id is not checked for liveness: it names a counterparty OR a document, with no single target table.
--
-- Fires only on rows written after this migration; the frozen companies (TRANSPORTATION, TRUCKING) are not written by
-- anyone, so they are not touched. This migration writes NO rows.

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

-- The first matched_* on the line whose document is missing or not live; NULL when every one is real.
CREATE OR REPLACE FUNCTION banking.bank_line_dead_link(p_line_id uuid) RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $fn$
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
  END
  FROM banking.bank_transactions bt
  WHERE bt.id = p_line_id
$fn$;

COMMENT ON FUNCTION banking.bank_line_dead_link(uuid) IS
  'ROUND 368.2(b): the first matched_* column on the bank line whose document is missing or not live (voided / revoked / reversed / soft-deleted); NULL when every link is real.';

CREATE OR REPLACE FUNCTION banking.refuse_bank_line_matched_to_nothing() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
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
                                bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id,
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
$fn$;

DROP TRIGGER IF EXISTS trg_bank_line_not_matched_to_nothing ON banking.bank_transactions;
CREATE CONSTRAINT TRIGGER trg_bank_line_not_matched_to_nothing
  AFTER INSERT OR UPDATE ON banking.bank_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_bank_line_matched_to_nothing();

CREATE OR REPLACE FUNCTION banking.refuse_live_match_row_on_released_line() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
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
                           bt.matched_relay_fuel_transaction_id, bt.matched_settlement_id, bt.matched_transfer_id,
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
$fn$;

DROP TRIGGER IF EXISTS trg_live_match_row_has_a_linked_line ON banking.reconciliation_matches;
CREATE CONSTRAINT TRIGGER trg_live_match_row_has_a_linked_line
  AFTER INSERT OR UPDATE ON banking.reconciliation_matches
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_live_match_row_on_released_line();

-- THE DOCUMENT SIDE. A document that stops being live (voided / revoked / reversed / soft-deleted) or is deleted while a
-- live bank line still names it is refused at COMMIT — so a void path that never touches the line cannot leave the two
-- sides disagreeing. Fires only on that transition (WHEN), and is an index probe (partial indexes below).
CREATE OR REPLACE FUNCTION banking.refuse_document_dead_under_live_bank_line() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $fn$
DECLARE
  v_col text := TG_ARGV[0];
  v_doc uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_line uuid;
BEGIN
  FOR v_line IN EXECUTE format('SELECT bt.id FROM banking.bank_transactions bt WHERE bt.%I = $1 AND bt.voided_at IS NULL', v_col) USING v_doc
  LOOP
    IF banking.bank_line_dead_link(v_line) IS NOT DISTINCT FROM v_col THEN
      RAISE EXCEPTION '%.% % is no longer live but bank line % still names it in %', TG_TABLE_SCHEMA, TG_TABLE_NAME, v_doc, v_line, v_col
        USING ERRCODE = 'check_violation',
              HINT = 'Release the bank line through the bank-line state machine (Undo / Unmatch) in the same transaction (ROUND 368.2(b)).';
    END IF;
  END LOOP;
  RETURN NULL;
END
$fn$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_bill_id ON banking.bank_transactions (matched_bill_id) WHERE matched_bill_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_bills_not_dead_under_bank_line ON accounting.bills;
CREATE CONSTRAINT TRIGGER trg_bills_not_dead_under_bank_line
  AFTER UPDATE OF voided_at, revoked_at ON accounting.bills
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND OLD.revoked_at IS NULL AND (NEW.voided_at IS NOT NULL OR NEW.revoked_at IS NOT NULL))
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_bill_id');
DROP TRIGGER IF EXISTS trg_bills_delete_not_under_bank_line ON accounting.bills;
CREATE CONSTRAINT TRIGGER trg_bills_delete_not_under_bank_line
  AFTER DELETE ON accounting.bills
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_bill_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_bill_payment_id ON banking.bank_transactions (matched_bill_payment_id) WHERE matched_bill_payment_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_bill_payments_not_dead_under_bank_line ON accounting.bill_payments;
CREATE CONSTRAINT TRIGGER trg_bill_payments_not_dead_under_bank_line
  AFTER UPDATE OF voided_at, revoked_at ON accounting.bill_payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND OLD.revoked_at IS NULL AND (NEW.voided_at IS NOT NULL OR NEW.revoked_at IS NOT NULL))
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_bill_payment_id');
DROP TRIGGER IF EXISTS trg_bill_payments_delete_not_under_bank_line ON accounting.bill_payments;
CREATE CONSTRAINT TRIGGER trg_bill_payments_delete_not_under_bank_line
  AFTER DELETE ON accounting.bill_payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_bill_payment_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_expense_id ON banking.bank_transactions (matched_expense_id) WHERE matched_expense_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_expenses_not_dead_under_bank_line ON accounting.expenses;
CREATE CONSTRAINT TRIGGER trg_expenses_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON accounting.expenses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_expense_id');
DROP TRIGGER IF EXISTS trg_expenses_delete_not_under_bank_line ON accounting.expenses;
CREATE CONSTRAINT TRIGGER trg_expenses_delete_not_under_bank_line
  AFTER DELETE ON accounting.expenses
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_expense_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_payment_id ON banking.bank_transactions (matched_payment_id) WHERE matched_payment_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_payments_not_dead_under_bank_line ON accounting.payments;
CREATE CONSTRAINT TRIGGER trg_payments_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON accounting.payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_payment_id');
DROP TRIGGER IF EXISTS trg_payments_delete_not_under_bank_line ON accounting.payments;
CREATE CONSTRAINT TRIGGER trg_payments_delete_not_under_bank_line
  AFTER DELETE ON accounting.payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_payment_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_invoice_id ON banking.bank_transactions (matched_invoice_id) WHERE matched_invoice_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_invoices_not_dead_under_bank_line ON accounting.invoices;
CREATE CONSTRAINT TRIGGER trg_invoices_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON accounting.invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_invoice_id');
DROP TRIGGER IF EXISTS trg_invoices_delete_not_under_bank_line ON accounting.invoices;
CREATE CONSTRAINT TRIGGER trg_invoices_delete_not_under_bank_line
  AFTER DELETE ON accounting.invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_invoice_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_transfer_id ON banking.bank_transactions (matched_transfer_id) WHERE matched_transfer_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_transfers_not_dead_under_bank_line ON banking.transfers;
CREATE CONSTRAINT TRIGGER trg_transfers_not_dead_under_bank_line
  AFTER UPDATE OF revoked_at ON banking.transfers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_transfer_id');
DROP TRIGGER IF EXISTS trg_transfers_delete_not_under_bank_line ON banking.transfers;
CREATE CONSTRAINT TRIGGER trg_transfers_delete_not_under_bank_line
  AFTER DELETE ON banking.transfers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_transfer_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_journal_entry_id ON banking.bank_transactions (matched_journal_entry_id) WHERE matched_journal_entry_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_journal_entries_not_dead_under_bank_line ON accounting.journal_entries;
CREATE CONSTRAINT TRIGGER trg_journal_entries_not_dead_under_bank_line
  AFTER UPDATE OF status, reversed_by_je_id, voided_at ON accounting.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN ((OLD.status = 'posted' AND OLD.reversed_by_je_id IS NULL AND OLD.voided_at IS NULL) AND NOT (NEW.status = 'posted' AND NEW.reversed_by_je_id IS NULL AND NEW.voided_at IS NULL))
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_journal_entry_id');
DROP TRIGGER IF EXISTS trg_journal_entries_delete_not_under_bank_line ON accounting.journal_entries;
CREATE CONSTRAINT TRIGGER trg_journal_entries_delete_not_under_bank_line
  AFTER DELETE ON accounting.journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_journal_entry_id');

DROP TRIGGER IF EXISTS trg_loads_not_dead_under_bank_line ON mdata.loads;
CREATE CONSTRAINT TRIGGER trg_loads_not_dead_under_bank_line
  AFTER UPDATE OF voided_at, soft_deleted_at ON mdata.loads
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND OLD.soft_deleted_at IS NULL AND (NEW.voided_at IS NOT NULL OR NEW.soft_deleted_at IS NOT NULL))
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_load_id');
DROP TRIGGER IF EXISTS trg_loads_delete_not_under_bank_line ON mdata.loads;
CREATE CONSTRAINT TRIGGER trg_loads_delete_not_under_bank_line
  AFTER DELETE ON mdata.loads
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_load_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_settlement_id ON banking.bank_transactions (matched_settlement_id) WHERE matched_settlement_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_driver_settlements_not_dead_under_bank_line ON driver_finance.driver_settlements;
CREATE CONSTRAINT TRIGGER trg_driver_settlements_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON driver_finance.driver_settlements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_settlement_id');
DROP TRIGGER IF EXISTS trg_driver_settlements_delete_not_under_bank_line ON driver_finance.driver_settlements;
CREATE CONSTRAINT TRIGGER trg_driver_settlements_delete_not_under_bank_line
  AFTER DELETE ON driver_finance.driver_settlements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_settlement_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_advance_id ON banking.bank_transactions (matched_advance_id) WHERE matched_advance_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_driver_advances_not_dead_under_bank_line ON driver_finance.driver_advances;
CREATE CONSTRAINT TRIGGER trg_driver_advances_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON driver_finance.driver_advances
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_advance_id');
DROP TRIGGER IF EXISTS trg_driver_advances_delete_not_under_bank_line ON driver_finance.driver_advances;
CREATE CONSTRAINT TRIGGER trg_driver_advances_delete_not_under_bank_line
  AFTER DELETE ON driver_finance.driver_advances
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_advance_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_factoring_advance_id ON banking.bank_transactions (matched_factoring_advance_id) WHERE matched_factoring_advance_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_factoring_advances_not_dead_under_bank_line ON accounting.factoring_advances;
CREATE CONSTRAINT TRIGGER trg_factoring_advances_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON accounting.factoring_advances
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_factoring_advance_id');
DROP TRIGGER IF EXISTS trg_factoring_advances_delete_not_under_bank_line ON accounting.factoring_advances;
CREATE CONSTRAINT TRIGGER trg_factoring_advances_delete_not_under_bank_line
  AFTER DELETE ON accounting.factoring_advances
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_factoring_advance_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_fuel_transaction_id ON banking.bank_transactions (matched_fuel_transaction_id) WHERE matched_fuel_transaction_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_fuel_transactions_not_dead_under_bank_line ON fuel.fuel_transactions;
CREATE CONSTRAINT TRIGGER trg_fuel_transactions_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON fuel.fuel_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_fuel_transaction_id');
DROP TRIGGER IF EXISTS trg_fuel_transactions_delete_not_under_bank_line ON fuel.fuel_transactions;
CREATE CONSTRAINT TRIGGER trg_fuel_transactions_delete_not_under_bank_line
  AFTER DELETE ON fuel.fuel_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_fuel_transaction_id');

CREATE INDEX IF NOT EXISTS idx_bank_transactions_matched_relay_fuel_transaction_id ON banking.bank_transactions (matched_relay_fuel_transaction_id) WHERE matched_relay_fuel_transaction_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_relay_fuel_transactions_not_dead_under_bank_line ON integrations.relay_fuel_transactions;
CREATE CONSTRAINT TRIGGER trg_relay_fuel_transactions_not_dead_under_bank_line
  AFTER UPDATE OF voided_at ON integrations.relay_fuel_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW WHEN (OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL)
  EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_relay_fuel_transaction_id');
DROP TRIGGER IF EXISTS trg_relay_fuel_transactions_delete_not_under_bank_line ON integrations.relay_fuel_transactions;
CREATE CONSTRAINT TRIGGER trg_relay_fuel_transactions_delete_not_under_bank_line
  AFTER DELETE ON integrations.relay_fuel_transactions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION banking.refuse_document_dead_under_live_bank_line('matched_relay_fuel_transaction_id');

COMMIT;
