-- P6-T11204 — Bank transaction categorization workflow + payment provenance (additive, idempotent).

BEGIN;

-- ─── banking.bank_transactions: categorization / workflow columns ────────────
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS linked_entity_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS category_kind TEXT;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS categorization_customer_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS categorization_vendor_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS categorization_gl_account_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS categorization_project_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS categorization_memo TEXT;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS suggested_match_invoice_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS suggested_match_bill_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS destination_bank_account_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS transfer_kind TEXT;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS paired_transaction_id UUID;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS skip_reason TEXT;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS investigate_note TEXT;
ALTER TABLE banking.bank_transactions ADD COLUMN IF NOT EXISTS categorized_at TIMESTAMPTZ;

UPDATE banking.bank_transactions
SET status = 'pending_categorization'
WHERE status IS NULL
   OR lower(status) = 'uncategorized';

ALTER TABLE banking.bank_transactions
  ALTER COLUMN status SET DEFAULT 'pending_categorization';

DO $$
BEGIN
  IF to_regclass('banking.bank_accounts') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_destination_bank_account_id_fkey'
    ) THEN
      ALTER TABLE banking.bank_transactions
        ADD CONSTRAINT bank_transactions_destination_bank_account_id_fkey
        FOREIGN KEY (destination_bank_account_id)
        REFERENCES banking.bank_accounts(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_paired_transaction_id_fkey'
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_paired_transaction_id_fkey
      FOREIGN KEY (paired_transaction_id)
      REFERENCES banking.bank_transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_pending_cat
  ON banking.bank_transactions (operating_company_id, transaction_date DESC)
  WHERE status = 'pending_categorization';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_company_status_date
  ON banking.bank_transactions (operating_company_id, status, transaction_date DESC);

-- ─── accounting.payments: provenance for Block Y cash-application UX ─────────
ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS payment_source_kind TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS source_bank_transaction_id UUID;
ALTER TABLE accounting.payments ADD COLUMN IF NOT EXISTS qbo_payment_id TEXT;

DO $$
BEGIN
  IF to_regclass('banking.bank_transactions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'payments_source_bank_transaction_id_fkey'
    ) THEN
      ALTER TABLE accounting.payments
        ADD CONSTRAINT payments_source_bank_transaction_id_fkey
        FOREIGN KEY (source_bank_transaction_id)
        REFERENCES banking.bank_transactions(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_source_bank_txn
  ON accounting.payments (source_bank_transaction_id)
  WHERE source_bank_transaction_id IS NOT NULL;

-- ─── accounting.bill_payments: batching + provenance ──────────────────────────
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS payment_batch_id UUID;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS payment_source_kind TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS source_bank_transaction_id UUID;

DO $$
BEGIN
  IF to_regclass('banking.bank_transactions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'bill_payments_source_bank_transaction_id_fkey'
    ) THEN
      ALTER TABLE accounting.bill_payments
        ADD CONSTRAINT bill_payments_source_bank_transaction_id_fkey
        FOREIGN KEY (source_bank_transaction_id)
        REFERENCES banking.bank_transactions(id)
        ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bill_payments_batch
  ON accounting.bill_payments (payment_batch_id)
  WHERE payment_batch_id IS NOT NULL;

COMMIT;
