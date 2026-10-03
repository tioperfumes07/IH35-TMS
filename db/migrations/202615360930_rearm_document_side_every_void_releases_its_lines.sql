-- 202615360930 · CC-3 · ROUND 368.2(b) — RE-ARM the 26 document-side refusals that 202615360700 disarmed. Numbered to sort
-- AFTER 202615360600 (creates them) and 202615360700 (disarms them), so a fresh database ends armed like production.
-- 202615360600 (CC-2) refuses a document going not-live while a bank line still names it through a matched_* pointer;
-- 202615360700 disarmed that side (ROUND 373 ordering) until every void path released the lines that name its document.
-- That now holds — rehearsed on a fork of br-fancy-credit-akjnd07a with all 26 enabled and the REAL void paths
-- (no row committed): bill, bill payment, invoice (voidDocument); expense (governance executor + both expense routes,
-- same release); a reversed JE (posting-engine source reversal); load, fuel transaction (stampDocumentVoided); driver
-- advance (reverseDriverAdvanceInClientTx); driver settlement and Relay fill (executeVoidCancel) — each one: line back to
-- For review, pointer cleared, release recorded, deferred refusals checked IMMEDIATE, accepted. Negative control: a raw
-- void with no release -> refused 23514. Transfers release through revokeTransferInClient (363-CC3-B).
-- Enables only; definitions unchanged; writes no rows.

BEGIN;
SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';
ALTER TABLE accounting.bills ENABLE TRIGGER trg_bills_not_dead_under_bank_line;
ALTER TABLE accounting.bills ENABLE TRIGGER trg_bills_delete_not_under_bank_line;
ALTER TABLE accounting.bill_payments ENABLE TRIGGER trg_bill_payments_not_dead_under_bank_line;
ALTER TABLE accounting.bill_payments ENABLE TRIGGER trg_bill_payments_delete_not_under_bank_line;
ALTER TABLE accounting.expenses ENABLE TRIGGER trg_expenses_not_dead_under_bank_line;
ALTER TABLE accounting.expenses ENABLE TRIGGER trg_expenses_delete_not_under_bank_line;
ALTER TABLE accounting.payments ENABLE TRIGGER trg_payments_not_dead_under_bank_line;
ALTER TABLE accounting.payments ENABLE TRIGGER trg_payments_delete_not_under_bank_line;
ALTER TABLE accounting.invoices ENABLE TRIGGER trg_invoices_not_dead_under_bank_line;
ALTER TABLE accounting.invoices ENABLE TRIGGER trg_invoices_delete_not_under_bank_line;
ALTER TABLE banking.transfers ENABLE TRIGGER trg_transfers_not_dead_under_bank_line;
ALTER TABLE banking.transfers ENABLE TRIGGER trg_transfers_delete_not_under_bank_line;
ALTER TABLE accounting.journal_entries ENABLE TRIGGER trg_journal_entries_not_dead_under_bank_line;
ALTER TABLE accounting.journal_entries ENABLE TRIGGER trg_journal_entries_delete_not_under_bank_line;
ALTER TABLE mdata.loads ENABLE TRIGGER trg_loads_not_dead_under_bank_line;
ALTER TABLE mdata.loads ENABLE TRIGGER trg_loads_delete_not_under_bank_line;
ALTER TABLE driver_finance.driver_settlements ENABLE TRIGGER trg_driver_settlements_not_dead_under_bank_line;
ALTER TABLE driver_finance.driver_settlements ENABLE TRIGGER trg_driver_settlements_delete_not_under_bank_line;
ALTER TABLE driver_finance.driver_advances ENABLE TRIGGER trg_driver_advances_not_dead_under_bank_line;
ALTER TABLE driver_finance.driver_advances ENABLE TRIGGER trg_driver_advances_delete_not_under_bank_line;
ALTER TABLE accounting.factoring_advances ENABLE TRIGGER trg_factoring_advances_not_dead_under_bank_line;
ALTER TABLE accounting.factoring_advances ENABLE TRIGGER trg_factoring_advances_delete_not_under_bank_line;
ALTER TABLE fuel.fuel_transactions ENABLE TRIGGER trg_fuel_transactions_not_dead_under_bank_line;
ALTER TABLE fuel.fuel_transactions ENABLE TRIGGER trg_fuel_transactions_delete_not_under_bank_line;
ALTER TABLE integrations.relay_fuel_transactions ENABLE TRIGGER trg_relay_fuel_transactions_not_dead_under_bank_line;
ALTER TABLE integrations.relay_fuel_transactions ENABLE TRIGGER trg_relay_fuel_transactions_delete_not_under_bank_line;
COMMIT;
