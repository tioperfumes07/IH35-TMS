-- ROUND 313 BANK-SURF-04 / BANK-ECON-04 — reconciliation Finish posts service charge + interest.
-- Claimed: CLAIMED-MIGRATION-NUMBERS.json 202615141200 (Cursor HH 14).
-- CREATE-only / ADD COLUMN IF NOT EXISTS. Never DROP. FORCE RLS unchanged.

BEGIN;

DO $$
BEGIN
  IF to_regclass('banking.reconciliation_sessions') IS NULL THEN
    RAISE NOTICE '202615141200: banking.reconciliation_sessions absent — skipping';
    RETURN;
  END IF;

  ALTER TABLE banking.reconciliation_sessions
    ADD COLUMN IF NOT EXISTS service_charge_cents bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS service_charge_date date NULL,
    ADD COLUMN IF NOT EXISTS service_charge_account_id uuid NULL,
    ADD COLUMN IF NOT EXISTS service_charge_journal_entry_id uuid NULL,
    ADD COLUMN IF NOT EXISTS interest_earned_cents bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS interest_earned_date date NULL,
    ADD COLUMN IF NOT EXISTS interest_earned_account_id uuid NULL,
    ADD COLUMN IF NOT EXISTS interest_earned_journal_entry_id uuid NULL;

  -- FKs additive; IF NOT EXISTS via constraint name probe (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reconciliation_sessions_service_charge_account_fk'
  ) THEN
    ALTER TABLE banking.reconciliation_sessions
      ADD CONSTRAINT reconciliation_sessions_service_charge_account_fk
      FOREIGN KEY (service_charge_account_id) REFERENCES catalogs.accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reconciliation_sessions_interest_earned_account_fk'
  ) THEN
    ALTER TABLE banking.reconciliation_sessions
      ADD CONSTRAINT reconciliation_sessions_interest_earned_account_fk
      FOREIGN KEY (interest_earned_account_id) REFERENCES catalogs.accounts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reconciliation_sessions_service_charge_je_fk'
  ) THEN
    ALTER TABLE banking.reconciliation_sessions
      ADD CONSTRAINT reconciliation_sessions_service_charge_je_fk
      FOREIGN KEY (service_charge_journal_entry_id) REFERENCES accounting.journal_entries(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reconciliation_sessions_interest_earned_je_fk'
  ) THEN
    ALTER TABLE banking.reconciliation_sessions
      ADD CONSTRAINT reconciliation_sessions_interest_earned_je_fk
      FOREIGN KEY (interest_earned_journal_entry_id) REFERENCES accounting.journal_entries(id);
  END IF;

  COMMENT ON COLUMN banking.reconciliation_sessions.service_charge_cents IS
    'BANK-ECON-04: bank fee entered on Finish; posted Dr expense / Cr bank via canonical JE poster.';
  COMMENT ON COLUMN banking.reconciliation_sessions.interest_earned_cents IS
    'BANK-ECON-04: interest earned on Finish; posted Dr bank / Cr income via canonical JE poster.';
END $$;

COMMIT;
