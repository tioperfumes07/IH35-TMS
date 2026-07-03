-- MD-3 (owner decision #7 clone program) — AR/AP clone-schema delta.
-- The AR/AP header tables already carry source_system + qbo_*_id (migration 0178) and the link tables exist
-- (accounting.payment_applications, accounting.bill_payments). This adds the remaining clone markers, per the
-- owner-ruled fork (clone rows = source_system='qbo' + source='qbo_clone', NO ALTER to any CHECK):
--   • source text on invoices/bills/payments — the 'qbo_clone' discriminator (nullable; NULL = TMS-native)
--   • voided_at on bills (invoices/payments already have it) — for clone void-supersede (void-not-delete)
-- Money-free; ADD-COLUMN + one-time backfill; idempotent. Tier-1 (accounting.* migration) → build-and-hold.

ALTER TABLE accounting.invoices ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE accounting.bills     ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE accounting.bills     ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE accounting.payments  ADD COLUMN IF NOT EXISTS source text;

-- Backfill: a row carrying a qbo id is a QBO clone → source='qbo_clone' (source_system already 'qbo' via 0178
-- for synced rows). TMS-native rows keep source NULL. Idempotent.
UPDATE accounting.invoices SET source='qbo_clone'
  WHERE qbo_invoice_id IS NOT NULL AND TRIM(qbo_invoice_id) <> '' AND source IS DISTINCT FROM 'qbo_clone';
UPDATE accounting.bills SET source='qbo_clone'
  WHERE qbo_bill_id IS NOT NULL AND TRIM(qbo_bill_id) <> '' AND source IS DISTINCT FROM 'qbo_clone';
UPDATE accounting.payments SET source='qbo_clone'
  WHERE qbo_payment_id IS NOT NULL AND TRIM(qbo_payment_id) <> '' AND source IS DISTINCT FROM 'qbo_clone';

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_source ON accounting.invoices (operating_company_id, source);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_source    ON accounting.bills (operating_company_id, source);
CREATE INDEX IF NOT EXISTS idx_accounting_payments_source ON accounting.payments (operating_company_id, source);
