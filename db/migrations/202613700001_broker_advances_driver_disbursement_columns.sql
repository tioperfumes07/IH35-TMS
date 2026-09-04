BEGIN;

-- LOAD-COSTS-COMPLETE item (2) (owner ruling 2026-09-04, verbatim): "the broker might send the
-- driver money and we apply it as a bill payment to the driver." Three distinct advance events
-- (owner's own numbering): (1) broker -> us, diesel, deducted from the invoice -- already built,
-- accounting.broker_advances, untouched by this migration. (2) broker -> THE DRIVER directly; we
-- apply it as a bill payment against driver_finance.driver_bills. (3) us -> the driver, a company
-- expense -- separate, no receivable, built via the existing accounting.expenses mechanism.
--
-- This migration is item (2)'s schema half. "Record a bill payment against the driver bill,
-- funded by the broker, linked to the SAME broker_advances row (instrument_reference is the
-- Comchek/EFT number -- one instrument, two sides, one trace)" -- three nullable columns on the
-- SAME accounting.broker_advances row item (1) already uses, rather than a second table:
--   disbursed_to_driver_bill_id  -- the driver_finance.driver_bills row this advance settled
--   disbursed_amount_cents       -- how much of this advance went to the driver directly (may be
--                                    less than amount_cents if the advance also had a diesel/other
--                                    portion; capped at the driver_bill's remaining balance by the
--                                    service layer, not by a DB constraint -- the constraint below
--                                    only guards the pair is set together, never one without the
--                                    other, and never a non-positive amount)
--   disbursed_journal_entry_id   -- the REAL, balanced JE this posted through
--                                    journal-entries.service (never a raw INSERT)
--
-- "It is NEVER driver pay, NEVER a driver debt, NEVER a settlement deduction" -- these columns
-- reference driver_finance.driver_bills (an existing liability row, not a new one) and
-- accounting.journal_entries; nothing here touches driver_finance.driver_liabilities,
-- driver_advances, or settlement_lines. Enforced additionally at the service layer (a source
-- guard), not by DDL alone -- a table reference cannot prove an absence of writes elsewhere.
--
-- Additive, idempotent, all three nullable (existing rows unaffected, item (1)'s receipt-only
-- rows never set them). No FORCE RLS change needed -- broker_advances already carries it from its
-- origin migration (202613630001).

ALTER TABLE accounting.broker_advances
  ADD COLUMN IF NOT EXISTS disbursed_to_driver_bill_id uuid REFERENCES driver_finance.driver_bills(id),
  ADD COLUMN IF NOT EXISTS disbursed_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS disbursed_journal_entry_id uuid REFERENCES accounting.journal_entries(id);

-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS. Guard the exact table+constraint identity so
-- migration replay is a no-op while a same-named constraint on another table cannot mask this one.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'broker_advances_disbursement_paired'
      AND conrelid = 'accounting.broker_advances'::regclass
  ) THEN
    ALTER TABLE accounting.broker_advances
      ADD CONSTRAINT broker_advances_disbursement_paired CHECK (
        (disbursed_to_driver_bill_id IS NULL AND disbursed_amount_cents IS NULL AND disbursed_journal_entry_id IS NULL)
        OR (disbursed_to_driver_bill_id IS NOT NULL AND disbursed_amount_cents > 0 AND disbursed_journal_entry_id IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_broker_advances_disbursed_to_driver_bill
  ON accounting.broker_advances (disbursed_to_driver_bill_id)
  WHERE disbursed_to_driver_bill_id IS NOT NULL;

COMMENT ON COLUMN accounting.broker_advances.disbursed_to_driver_bill_id IS
  'LOAD-COSTS-COMPLETE item (2), 2026-09-04: set when the broker paid the driver directly (Comchek/EFT) and this advance settles part of that driver_bill -- never a driver liability row, only a settlement of an existing one. NULL for a pure receipt (item (1)).';
COMMENT ON COLUMN accounting.broker_advances.disbursed_journal_entry_id IS
  'The real, balanced JE (DR Driver Settlements Payable / CR Accounts Receivable) this disbursement posted through journal-entries.service. Never set without disbursed_to_driver_bill_id (paired CHECK).';

COMMIT;
