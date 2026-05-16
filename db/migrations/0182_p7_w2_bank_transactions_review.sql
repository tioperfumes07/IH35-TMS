-- P7 Wave 2 v3 — banking.bank_transactions review / suggestion / reconciliation linkage.
-- NOTE: Operational table is banking.bank_transactions (not banking.transactions).

BEGIN;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS review_state text NOT NULL DEFAULT 'for_review'
    CHECK (review_state IN ('for_review', 'categorized', 'excluded', 'matched', 'transfer')),
  ADD COLUMN IF NOT EXISTS matched_invoice_id uuid REFERENCES accounting.invoices(id),
  ADD COLUMN IF NOT EXISTS matched_bill_id uuid REFERENCES accounting.bills(id),
  ADD COLUMN IF NOT EXISTS matched_payment_id uuid REFERENCES accounting.payments(id),
  ADD COLUMN IF NOT EXISTS matched_bill_payment_id uuid REFERENCES accounting.bill_payments(id),
  ADD COLUMN IF NOT EXISTS matched_transfer_id uuid REFERENCES banking.transfers(id),
  ADD COLUMN IF NOT EXISTS matched_journal_entry_id uuid REFERENCES accounting.journal_entries(id),
  ADD COLUMN IF NOT EXISTS suggested_vendor_id uuid REFERENCES mdata.vendors(id),
  ADD COLUMN IF NOT EXISTS suggested_account_id uuid REFERENCES catalogs.accounts(id),
  ADD COLUMN IF NOT EXISTS suggested_confidence text CHECK (
    suggested_confidence IS NULL OR suggested_confidence IN ('high', 'medium', 'low')
  ),
  ADD COLUMN IF NOT EXISTS suggested_source text,
  ADD COLUMN IF NOT EXISTS suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS description_normalized text,
  ADD COLUMN IF NOT EXISTS excluded_reason text,
  ADD COLUMN IF NOT EXISTS reconciliation_session_id uuid REFERENCES banking.reconciliation_sessions(id),
  ADD COLUMN IF NOT EXISTS reconciliation_cleared boolean NOT NULL DEFAULT false;

UPDATE banking.bank_transactions
SET description_normalized = NULLIF(
  TRIM(
    BOTH FROM regexp_replace(
      COALESCE(description, ''),
      '^\s*(ACH|WIRE|POS|DEBIT|CREDIT|PAYROLL|SWEEP|REMOTE\s+DEPOSIT)\s+[^\s]+\s*[-:.]*\s*',
      '',
      'i'
    )
  ),
  ''
)
WHERE description_normalized IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_txn_company_review_date
  ON banking.bank_transactions (operating_company_id, review_state, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_bank_txn_company_desc_norm
  ON banking.bank_transactions (operating_company_id, description_normalized);

COMMIT;
