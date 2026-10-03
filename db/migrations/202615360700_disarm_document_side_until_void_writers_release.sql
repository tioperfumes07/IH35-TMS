-- 202615360700_disarm_document_side_until_void_writers_release.sql
-- ROUND 373 ordering — "the writers are fixed first, then the refusal is armed. Arming it first would make his next
-- void fail at COMMIT while he is testing." 202615360600 armed ROUND 368.2(b)'s DOCUMENT side (a document may not stop
-- being live while a bank line still names it) before every void path released the lines that name its document:
-- the void cascade (void.service.ts unmatchBankTransactionsForVoid) released only linked_entity_id / the document's own
-- source_bank_transaction_id, never matched_expense_id / matched_relay_fuel_transaction_id / ... — so voiding a matched
-- expense or fill would have been refused at COMMIT.
--
-- This DISABLES those 26 triggers (definitions kept, nothing dropped). The BANK-LINE refusal
-- (trg_bank_line_not_matched_to_nothing) and the MATCH-ROW refusal (trg_live_match_row_has_a_linked_line) STAY ARMED:
-- they only refuse a bad write to the line or the match row itself, never a void. The document side is re-armed by a
-- later migration once every void path is proven to release its lines (verify-no-bank-line-is-matched-to-nothing
-- reports each disabled trigger by name until then). Writes no rows.

BEGIN;
SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';
ALTER TABLE accounting.bills DISABLE TRIGGER trg_bills_not_dead_under_bank_line;
ALTER TABLE accounting.bills DISABLE TRIGGER trg_bills_delete_not_under_bank_line;
ALTER TABLE accounting.bill_payments DISABLE TRIGGER trg_bill_payments_not_dead_under_bank_line;
ALTER TABLE accounting.bill_payments DISABLE TRIGGER trg_bill_payments_delete_not_under_bank_line;
ALTER TABLE accounting.expenses DISABLE TRIGGER trg_expenses_not_dead_under_bank_line;
ALTER TABLE accounting.expenses DISABLE TRIGGER trg_expenses_delete_not_under_bank_line;
ALTER TABLE accounting.payments DISABLE TRIGGER trg_payments_not_dead_under_bank_line;
ALTER TABLE accounting.payments DISABLE TRIGGER trg_payments_delete_not_under_bank_line;
ALTER TABLE accounting.invoices DISABLE TRIGGER trg_invoices_not_dead_under_bank_line;
ALTER TABLE accounting.invoices DISABLE TRIGGER trg_invoices_delete_not_under_bank_line;
ALTER TABLE banking.transfers DISABLE TRIGGER trg_transfers_not_dead_under_bank_line;
ALTER TABLE banking.transfers DISABLE TRIGGER trg_transfers_delete_not_under_bank_line;
ALTER TABLE accounting.journal_entries DISABLE TRIGGER trg_journal_entries_not_dead_under_bank_line;
ALTER TABLE accounting.journal_entries DISABLE TRIGGER trg_journal_entries_delete_not_under_bank_line;
ALTER TABLE mdata.loads DISABLE TRIGGER trg_loads_not_dead_under_bank_line;
ALTER TABLE mdata.loads DISABLE TRIGGER trg_loads_delete_not_under_bank_line;
ALTER TABLE driver_finance.driver_settlements DISABLE TRIGGER trg_driver_settlements_not_dead_under_bank_line;
ALTER TABLE driver_finance.driver_settlements DISABLE TRIGGER trg_driver_settlements_delete_not_under_bank_line;
ALTER TABLE driver_finance.driver_advances DISABLE TRIGGER trg_driver_advances_not_dead_under_bank_line;
ALTER TABLE driver_finance.driver_advances DISABLE TRIGGER trg_driver_advances_delete_not_under_bank_line;
ALTER TABLE accounting.factoring_advances DISABLE TRIGGER trg_factoring_advances_not_dead_under_bank_line;
ALTER TABLE accounting.factoring_advances DISABLE TRIGGER trg_factoring_advances_delete_not_under_bank_line;
ALTER TABLE fuel.fuel_transactions DISABLE TRIGGER trg_fuel_transactions_not_dead_under_bank_line;
ALTER TABLE fuel.fuel_transactions DISABLE TRIGGER trg_fuel_transactions_delete_not_under_bank_line;
ALTER TABLE integrations.relay_fuel_transactions DISABLE TRIGGER trg_relay_fuel_transactions_not_dead_under_bank_line;
ALTER TABLE integrations.relay_fuel_transactions DISABLE TRIGGER trg_relay_fuel_transactions_delete_not_under_bank_line;
COMMIT;
