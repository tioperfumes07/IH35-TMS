-- 202615440510_deposit_from_bank_line.sql
-- CC-1 · ROUND 441.5 Phase 2 — a categorized money-IN bank line creates a DEPOSIT document (QBO "Add funds to this
-- deposit"), linked both ways. Owner, 2026-10-07: "ours should work exactly as quickbooks."
--
-- In QuickBooks a money-in bank-feed line added to a category is a Deposit: the bank account is debited and the line's
-- account (income, a liability such as 2410 related-party loan, equity such as 3000 owner's capital) is credited, with the
-- party it was received from. accounting.deposits only knew QBO "Make Deposit" (receipts out of Undeposited Funds).
-- Measured 2026-10-07: 23 money-in categorizations ($35,355.00: 20 to 2410, 3 to 3000) are bare journal entries.
--
--   deposit_lines
--     - line_type 'account': the "add funds" line. account_id (the credited account, required on it and only on it),
--       received_from_vendor_id / received_from_customer_id (the payer; at most one)
--   deposits
--     - undeposited_funds_account_id becomes optional: a deposit made only of account lines never touches Undeposited
--       Funds. The posting builder refuses a deposit with receipt lines and no Undeposited Funds account.
--     - source_bank_transaction_id: the bank line that created it (one live deposit per line). Undo of the line voids it;
--       voiding it releases the line.
-- Additive, idempotent. No existing row changes: every existing line keeps its type and its NULL account.

ALTER TABLE accounting.deposit_lines ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES catalogs.accounts (id);
ALTER TABLE accounting.deposit_lines ADD COLUMN IF NOT EXISTS received_from_vendor_id uuid REFERENCES mdata.vendors (id);
ALTER TABLE accounting.deposit_lines ADD COLUMN IF NOT EXISTS received_from_customer_id uuid REFERENCES mdata.customers (id);

ALTER TABLE accounting.deposit_lines DROP CONSTRAINT IF EXISTS deposit_lines_line_type_check;
ALTER TABLE accounting.deposit_lines ADD CONSTRAINT deposit_lines_line_type_check
  CHECK (line_type = ANY (ARRAY['customer_payment'::text, 'factoring_advance'::text, 'cash_back'::text, 'account'::text]));

ALTER TABLE accounting.deposit_lines DROP CONSTRAINT IF EXISTS deposit_lines_source_xor;
ALTER TABLE accounting.deposit_lines ADD CONSTRAINT deposit_lines_source_xor CHECK (
     (line_type = 'customer_payment' AND source_payment_id IS NOT NULL AND source_factoring_advance_id IS NULL)
  OR (line_type = 'factoring_advance' AND source_factoring_advance_id IS NOT NULL AND source_payment_id IS NULL)
  OR (line_type = 'cash_back' AND source_payment_id IS NULL AND source_factoring_advance_id IS NULL)
  OR (line_type = 'account' AND source_payment_id IS NULL AND source_factoring_advance_id IS NULL)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deposit_lines_account_only_on_account_lines') THEN
    ALTER TABLE accounting.deposit_lines ADD CONSTRAINT deposit_lines_account_only_on_account_lines
      CHECK ((line_type = 'account') = (account_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deposit_lines_one_payer') THEN
    ALTER TABLE accounting.deposit_lines ADD CONSTRAINT deposit_lines_one_payer
      CHECK (received_from_vendor_id IS NULL OR received_from_customer_id IS NULL);
  END IF;
END $$;

ALTER TABLE accounting.deposits ALTER COLUMN undeposited_funds_account_id DROP NOT NULL;
ALTER TABLE accounting.deposits ADD COLUMN IF NOT EXISTS source_bank_transaction_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deposits_source_bank_transaction_id_fkey') THEN
    ALTER TABLE accounting.deposits
      ADD CONSTRAINT deposits_source_bank_transaction_id_fkey
      FOREIGN KEY (source_bank_transaction_id) REFERENCES banking.bank_transactions (id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_deposits_live_source_bank_transaction
  ON accounting.deposits (operating_company_id, source_bank_transaction_id)
  WHERE source_bank_transaction_id IS NOT NULL AND voided_at IS NULL;
