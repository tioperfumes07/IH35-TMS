-- 202614301200_faro_invoice_line_deductions.sql
-- Shared backlog (Lead, claimed #22388; migration claim #22398).
--
-- Faro's export carries, per invoice, every deduction between the purchase (face) and the net advance:
--   face - Escrow Rsv - Cash Rsv - Discount - Fees - Dispatch - Sch Fee = Net Adv
-- (holds on all 82 funded invoices of the owner's 2026-09-23 "PURCHASE REPORT ALL" export, to the cent).
-- factor.faro_invoice_lines stored only gross, advance, reserve (Escrow Rsv), fee (Discount), chargeback
-- and net, so four of those deductions were read and thrown away: Cash Rsv (its own pool, owner ruling
-- GL 1235), Fees (Faro's flat wire fee), Dispatch and Sch Fee.
--
-- Additive and CREATE-only. Nullable on purpose: NULL means "not captured" (a line imported before this
-- column existed, or an export without that column), never a guessed 0. No backfill: rows reach these
-- columns through the importer. Non-negative CHECKs are NOT VALID so no existing row is re-validated.

ALTER TABLE factor.faro_invoice_lines ADD COLUMN IF NOT EXISTS cash_rsv_amount_cents bigint;
ALTER TABLE factor.faro_invoice_lines ADD COLUMN IF NOT EXISTS fees_amount_cents bigint;
ALTER TABLE factor.faro_invoice_lines ADD COLUMN IF NOT EXISTS dispatch_amount_cents bigint;
ALTER TABLE factor.faro_invoice_lines ADD COLUMN IF NOT EXISTS schedule_fee_amount_cents bigint;

COMMENT ON COLUMN factor.faro_invoice_lines.cash_rsv_amount_cents IS
  'Faro export "Cash Rsv": its own reserve pool (owner ruling: GL 1235), never the escrow reserve. NULL = not captured.';
COMMENT ON COLUMN factor.faro_invoice_lines.fees_amount_cents IS
  'Faro export "Fees": the flat wire/ACH fee, a different charge than fee_amount_cents (= "Discount"). NULL = not captured.';
COMMENT ON COLUMN factor.faro_invoice_lines.dispatch_amount_cents IS
  'Faro export "Dispatch" deduction. NULL = not captured.';
COMMENT ON COLUMN factor.faro_invoice_lines.schedule_fee_amount_cents IS
  'Faro export "Sch Fee" (schedule fee) deduction. NULL = not captured.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faro_invoice_lines_deductions_nonneg'
                   AND conrelid = 'factor.faro_invoice_lines'::regclass) THEN
    ALTER TABLE factor.faro_invoice_lines
      ADD CONSTRAINT faro_invoice_lines_deductions_nonneg CHECK (
        (cash_rsv_amount_cents IS NULL OR cash_rsv_amount_cents >= 0)
        AND (fees_amount_cents IS NULL OR fees_amount_cents >= 0)
        AND (dispatch_amount_cents IS NULL OR dispatch_amount_cents >= 0)
        AND (schedule_fee_amount_cents IS NULL OR schedule_fee_amount_cents >= 0)
      ) NOT VALID;
  END IF;
END
$$;
