-- THREE-DATES-COVERAGE-GAP (owner ruling, 2026-09-01, verified against QuickBooks + IRS
-- constructive-payment doctrine). Every money document needs three distinct, never-collapsed
-- dates:
--   1. incurred/earned date  -> accrual recognition
--   2. payment-issued date   -> cash-basis recognition + GL posting period + tax year
--      (constructive payment: a check MAILED Dec 31 is a December deduction even if it clears
--      in February -- the cleared date never redates a transaction)
--   3. cleared date          -> which bank-reconciliation session it ticks off in, and NOTHING
--      else
--
-- accounting.invoices already has issue_date/delivery_date/due_date (invoices are not directly
-- bank-matched -- payments against them are). accounting.bills already has bill_date/due_date
-- (its own accrual date, correctly separate from the cash side). driver_finance.
-- driver_settlements already gets this right: payment_sent_at (issued) + payment_cleared_at
-- (cleared) + bank_settle_date, all distinct columns.
--
-- The actual gap: accounting.payments and accounting.bill_payments each carry exactly ONE date
-- column, payment_date -- doing double duty for "issued" and "cleared" with no way to tell them
-- apart. This adds cleared_date (nullable, additive) to both, using driver_settlements'
-- reference shape as the model. payment_date keeps its existing meaning (payment issued/
-- authorized) unchanged -- nothing existing is renamed or reinterpreted, so no code that reads
-- payment_date today needs to change.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.

BEGIN;

ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS cleared_date date;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS cleared_date date;

COMMENT ON COLUMN accounting.payments.cleared_date IS
  'THREE-DATES-COVERAGE-GAP: the date the bank cleared this payment -- drives ONLY which reconciliation session it settles in. Never used for GL period / cash-basis recognition / tax year (that is payment_date). Nullable until a matching bank transaction clears it.';
COMMENT ON COLUMN accounting.bill_payments.cleared_date IS
  'THREE-DATES-COVERAGE-GAP: the date the bank cleared this payment -- drives ONLY which reconciliation session it settles in. Never used for GL period / cash-basis recognition / tax year (that is payment_date). Nullable until a matching bank transaction clears it.';

COMMIT;
