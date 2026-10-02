-- BANK-F91038 / ORDERS B-4 Amount to Credit → vendor credit on Save.
-- Claimed: 202615292200 (CLAIM-RESERVE #24257). Cursor HH 22.
--
-- accounting.vendor_credits.source_payment_id already FKs accounting.payments (AR customer
-- payments). Bill-payment overpay needs a parallel pointer at accounting.bill_payments so the
-- poster can resolve the bank that cash left and write the Dr A/P / Cr cash JE (same accounts as
-- bill_payment — no new GL math) with a spine row in the same posting transaction.
--
-- Additive only. Idempotent. FORCE RLS unchanged. No DROP.

ALTER TABLE accounting.vendor_credits
  ADD COLUMN IF NOT EXISTS source_bill_payment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'vendor_credits_source_bill_payment_id_fkey'
      AND conrelid = 'accounting.vendor_credits'::regclass
  ) THEN
    ALTER TABLE accounting.vendor_credits
      ADD CONSTRAINT vendor_credits_source_bill_payment_id_fkey
      FOREIGN KEY (source_bill_payment_id)
      REFERENCES accounting.bill_payments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_vendor_credits_source_bill_payment
  ON accounting.vendor_credits (operating_company_id, source_bill_payment_id)
  WHERE source_bill_payment_id IS NOT NULL;

COMMENT ON COLUMN accounting.vendor_credits.source_bill_payment_id IS
  'BANK-F91038: bill-payment overpay origin. When set, the vendor_credit poster writes Dr A/P / Cr cash '
  '(same accounts as bill_payment) and a transaction_source_links spine row in the same posting txn. '
  'Manual vendor credits leave this NULL and stay subledger-only (existing law).';

-- GRANTs already cover the table for ih35_app; new column inherits.
