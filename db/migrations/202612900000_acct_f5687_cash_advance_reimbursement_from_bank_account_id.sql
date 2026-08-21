-- ACCT-F5687 — closes instances (b) and (c) of CLS-CASH-OUT-CREDITS-CLEARING-ACCOUNT /
-- LV-ADVANCE-CREDITS-UNDEPOSITED-NOT-THE-BANK (board rows 1194/1195/1901).
--
-- Instance (a) (buildDriverAdvanceLines, driver_finance.driver_advances) was already fixed under
-- ACCT-F358 (PR #5882): the builder now credits the advance's own from_bank_account_id via the
-- CHAIN-04 bank->GL bridge, fail-loud if unmapped. Instances (b) buildCashAdvanceLines
-- (driver_finance.cash_advance_requests) and (c) buildDriverReimbursementLines
-- (driver_finance.driver_reimbursements) could not receive the same fix because neither source
-- table has ANY bank/account column at all — the row itself cannot say which bank the cash left,
-- so no posting-logic change alone can close them. This migration adds the missing column.
--
-- Additive, idempotent (IF NOT EXISTS), no data touched: both columns start NULL, so every
-- existing row's behavior is unchanged — the builders (fixed alongside this migration) still fall
-- back to resolveDisbursementCashAccountForCompany (ACCT-F345, fail-closed company default) when
-- from_bank_account_id is NULL, exactly as before. Live-verified on prod 2026-08-21: neither table
-- has a posted journal_entry_postings row yet (0 rows for source_transaction_type IN
-- ('cash_advance','driver_reimbursement')), so there is no historical row to repair — this is a
-- pure schema addition ahead of the first real disbursement, per the board row's own framing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'driver_finance' AND table_name = 'cash_advance_requests'
      AND column_name = 'from_bank_account_id'
  ) THEN
    ALTER TABLE driver_finance.cash_advance_requests
      ADD COLUMN from_bank_account_id uuid REFERENCES banking.bank_accounts(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'driver_finance' AND table_name = 'driver_reimbursements'
      AND column_name = 'from_bank_account_id'
  ) THEN
    ALTER TABLE driver_finance.driver_reimbursements
      ADD COLUMN from_bank_account_id uuid REFERENCES banking.bank_accounts(id);
  END IF;
END $$;
