-- 202615840910 · CC-3 · LEAD 443.120 A — safety.civil_fines.converted_to_liability_id becomes a real foreign key to
-- driver_finance.driver_liabilities(id).
-- WHY: a fine's converted pointer outlived its liability (a dangling pointer the Owner had to clear by hand; 443.114
-- gave the trigger a narrow "clear only when the liability does not exist" exception). Migration 0050 declared this FK on
-- safety.fines, but neither a fresh chain nor prod carries it on the renamed safety.civil_fines. With the FK a fine can
-- never point at a liability that does not exist, and a referenced liability cannot be deleted (liabilities are voided,
-- never deleted) — ON DELETE NO ACTION, so safety.enforce_fine_lock_after_conversion is unchanged.
-- Prod has 0 orphans (measured read-only 2026-10-12), so NOT VALID + VALIDATE in this migration is a no-op scan.
-- Plain FK: driver_liabilities has no (operating_company_id, id) key and the pointer is already UNIQUE per fine.
-- Idempotent. History is not modified.
SET LOCAL lock_timeout = '60s';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'safety.civil_fines'::regclass
       AND conname = 'civil_fines_converted_to_liability_id_fkey'
  ) THEN
    ALTER TABLE safety.civil_fines ADD CONSTRAINT civil_fines_converted_to_liability_id_fkey
      FOREIGN KEY (converted_to_liability_id) REFERENCES driver_finance.driver_liabilities (id) NOT VALID;
  END IF;
END $$;
ALTER TABLE safety.civil_fines VALIDATE CONSTRAINT civil_fines_converted_to_liability_id_fkey;
