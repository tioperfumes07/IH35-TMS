-- USMCA TRANSACTION PURGE - GENERATED 2026-09-23 from the live schema.
-- Source of truth: scripts/purge/usmca-purge-classification.json + live pg_constraint.
-- DO NOT HAND-EDIT. Change the classification and regenerate.
-- Company 5c854333-6ea5-4faa-af31-67cb272fef80 (USMCA). Banking is EXCLUDED: bank transactions,
-- accounts and categories are KEPT. Only match/split/alert rows pointing at purged
-- documents go, and the bank transactions they pointed at are simply left unmatched.
-- Order below is reverse foreign-key order, computed from live pg_constraint.
-- THIS FILE DOES NOT COMMIT. It ends in ROLLBACK. The owner uncomments COMMIT, once,
-- at the moment he says "run the purge", and never before a fresh pre-purge snapshot exists.

BEGIN;
SET LOCAL app.bypass_rls = 'lucia';
SET LOCAL app.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
SET LOCAL app.current_operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- ---------------------------------------------------------------------------
-- STEP 0. BREAK THE FOREIGN-KEY CYCLES. All four columns verified nullable live.
--   accounting.expenses -> fuel.fuel_transactions -> driver_settlement_deductions -> expenses
--   driver_settlement_deductions <-> fuel.fuel_transactions
-- ---------------------------------------------------------------------------
UPDATE accounting.expenses SET source_fuel_transaction_id = NULL
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
UPDATE driver_finance.driver_settlement_deductions
   SET source_fuel_transaction_id = NULL, source_expense_id = NULL
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
UPDATE fuel.fuel_transactions SET overage_deduction_id = NULL
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- Break the self-referencing reversal links on journal entries.
UPDATE accounting.journal_entries SET reversed_by_je_id = NULL, reverses_je_id = NULL
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- ---------------------------------------------------------------------------
-- STEP 1. DELETE, CHILDREN FIRST. 56 tables.
-- ---------------------------------------------------------------------------

--  1/56
DELETE FROM accounting.transaction_source_links
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

--  2/56
DELETE FROM accounting.journal_entry_postings
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

--  3/56
DELETE FROM accounting.escrow_postings
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

--  4/56
DELETE FROM accounting.expense_lines
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

--  5/56
DELETE FROM banking.bank_transaction_splits
 WHERE result_journal_entry_id IN (SELECT id FROM accounting.journal_entries WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80')
    OR load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80');

--  6/56
DELETE FROM driver_finance.settlement_contract_lines
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

--  7/56
DELETE FROM fuel.fuel_transactions
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

--  8/56
DELETE FROM driver_finance.driver_settlement_deductions
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

--  9/56
DELETE FROM accounting.expenses
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 10/56
DELETE FROM accounting.factoring_default_interest_accruals
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 11/56
DELETE FROM accounting.factoring_lifecycle_posting_keys
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 12/56
DELETE FROM accounting.factoring_reserve_movements
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 13/56
DELETE FROM accounting.load_revenue_recognition_postings
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 14/56
DELETE FROM banking.reconciliation_drift_alerts
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 15/56
DELETE FROM driver_finance.driver_advances
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 16/56
DELETE FROM driver_finance.driver_settlement_gl_bills
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 17/56
DELETE FROM driver_finance.driver_reimbursements
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 18/56
DELETE FROM driver_finance.escrow_ledger
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 19/56
DELETE FROM driver_finance.settlement_lines
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 20/56
DELETE FROM driver_finance.driver_bills
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 21/56
DELETE FROM driver_finance.deduction_schedule
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 22/56
DELETE FROM driver_finance.driver_liabilities
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 23/56
DELETE FROM driver_finance.driver_settlement_gl_runs
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 24/56
DELETE FROM driver_finance.payrun_gl_runs
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 25/56
DELETE FROM accounting.journal_entries
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 26/56
DELETE FROM accounting.posting_batches
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 27/56
DELETE FROM accounting.invoice_disputes
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 28/56
DELETE FROM dispatch.load_cancellations
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 29/56
DELETE FROM accounting.invoice_lines
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 30/56
DELETE FROM accounting.payment_applications
 WHERE invoice_id IN (SELECT id FROM accounting.invoices WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80');

-- 31/56
DELETE FROM accounting.invoices
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 32/56
DELETE FROM accounting.bill_lines
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 33/56
DELETE FROM accounting.bills
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 34/56
DELETE FROM accounting.factoring_advances
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 35/56
DELETE FROM accounting.company_settlements
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 36/56
DELETE FROM accounting.outbox_events
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 37/56
DELETE FROM accounting.ob_register_audit_events
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 38/56
DELETE FROM accounting.period_cash_basis_snapshot
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 39/56
DELETE FROM driver_finance.escrow_balances
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 40/56
DELETE FROM driver_finance.presettlement_link_suggestions
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 41/56
DELETE FROM driver_finance.driver_settlements
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 42/56
DELETE FROM driver_finance.settlement_payment_events
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 43/56
DELETE FROM dispatch.load_assignment_history
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 44/56
DELETE FROM dispatch.load_charge_lines
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 45/56
DELETE FROM dispatch.load_id_reservations
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 46/56
DELETE FROM dispatch.driver_layovers
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 47/56
DELETE FROM dispatch.manual_delivery_authorizations
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 48/56
DELETE FROM dispatch.intransit_issues
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 49/56
DELETE FROM dispatch.stop_arrivals
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 50/56
DELETE FROM dispatch.pod_documents
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 51/56
DELETE FROM expense_attribution.expense_load_links
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 52/56
DELETE FROM expense_attribution.expense_seq_per_load
 WHERE load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80');

-- 53/56
DELETE FROM mdata.load_stop_legs
 WHERE load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80');

-- 54/56
DELETE FROM mdata.load_stops
 WHERE load_id IN (SELECT id FROM mdata.loads WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80');

-- 55/56
DELETE FROM mdata.loads
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- 56/56
DELETE FROM banking.reconciliation_matches
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';

-- ---------------------------------------------------------------------------
-- NOT HERE ON PURPOSE
--   docs.files / docs.file_links - the 2026-09-22 SQL deleted all 475 USMCA rows.
--   Owner-uploaded source documents are evidence and are KEPT. Only app-generated
--   artifacts of purged documents may go, in their own reviewed step.
--   banking.bank_transactions / bank_accounts / transaction_categories - banking is
--   excluded from the purge by the owner's own scope.
--   All master data - customers, vendors, drivers, locations, chart of accounts, pay
--   rates, escrow settings, periods - is KEPT. The classification file names every one.
-- ---------------------------------------------------------------------------

-- COMMIT;   -- owner only, at the moment of the purge
ROLLBACK;
