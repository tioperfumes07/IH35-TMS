-- Lead ruling 2026-10-01 17:20Z — recon service charge posts as expense document.
-- Claimed: CLAIMED-MIGRATION-NUMBERS.json 202610011900 (Cursor HH 19).
-- CREATE-only / ADD COLUMN IF NOT EXISTS. Never DROP.

BEGIN;

DO $$
BEGIN
  IF to_regclass('banking.reconciliation_sessions') IS NULL THEN
    RAISE NOTICE '202610011900: banking.reconciliation_sessions absent — skipping';
    RETURN;
  END IF;

  ALTER TABLE banking.reconciliation_sessions
    ADD COLUMN IF NOT EXISTS service_charge_expense_id uuid NULL;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reconciliation_sessions_service_charge_expense_fk'
  ) THEN
    ALTER TABLE banking.reconciliation_sessions
      ADD CONSTRAINT reconciliation_sessions_service_charge_expense_fk
      FOREIGN KEY (service_charge_expense_id) REFERENCES accounting.expenses(id);
  END IF;

  COMMENT ON COLUMN banking.reconciliation_sessions.service_charge_expense_id IS
    'BANK-ECON-04 root fix: service charge is an accounting.expenses document (vendor=bank, paid-from=bank GL); JE FK stays on service_charge_journal_entry_id via the expense poster.';
  -- service_charge_cents is owned by 202615141200 (sorts AFTER this file on a fresh database): comment it only when it exists.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'banking' AND table_name = 'reconciliation_sessions' AND column_name = 'service_charge_cents'
  ) THEN
    COMMENT ON COLUMN banking.reconciliation_sessions.service_charge_cents IS
      'BANK-ECON-04: bank fee entered on Finish; posted as expense document (Dr fee / Cr bank) via expense engine — never a handwritten cost JE.';
  END IF;
END $$;

COMMIT;
