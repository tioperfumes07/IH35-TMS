-- VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE (GO-0009 G1) — factoring.batch is the one money-adjacent
-- table in the is_sample_data family (see accounting.bills/invoices/expenses/payments/
-- bill_payments/journal_entries, driver_finance.driver_settlements/settlement_lines,
-- mdata.customers/drivers/equipment/loads/units, all with the same column) that never got the
-- column at all. Without it, a demo/test factoring batch cannot be distinguished from a real one
-- in any aging/balances/factoring report that filters is_sample_data = false, and cannot inherit
-- the flag from its own invoice_ids the way accounting.bill_payments already inherits from
-- accounting.bills.
--
-- Additive-only: NOT NULL DEFAULT false so every existing row is unambiguously "not sample" (the
-- honest default — see scripts/known-gl-posting-coverage-gaps.json's own "never guess" law; no
-- existing factoring.batch row is a known test fixture, so backfilling anything other than false
-- here would be fabricating a classification). No RLS/grant changes needed — factoring.batch's
-- existing RLS policies and ih35_app grants already cover every column on the table by design
-- (SELECT/INSERT/UPDATE/DELETE are granted at the table level, not per-column).

BEGIN;

ALTER TABLE factoring.batch
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN factoring.batch.is_sample_data IS
  'VEND-F-TEST-DATA-NOT-FLAGGED-SAMPLE — marks a batch as demo/test data, mirroring accounting.bills.is_sample_data. Never a delete-selector; marks data at birth, selects nothing for destruction.';

COMMIT;
