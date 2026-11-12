-- 202616501200 · Cursor · Codex cert / verify-money-lines-same-entity-fks
-- Column reinstated_from_void_je_id landed in 202616390100 with a single-column FK to
-- accounting.journal_entries(id). Money law requires a company-composite FK
-- (operating_company_id, reinstated_from_void_je_id) → journal_entries(operating_company_id, id),
-- same shape as settlement_lines_void_reversal_je_same_entity_fkey (202615330904) and the
-- check_number_registry / journal_entries reinstate composites (202615740913).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'driver_finance.settlement_lines'::regclass
       AND conname = 'settlement_lines_reinstated_from_void_je_same_entity_fkey'
  ) THEN
    ALTER TABLE driver_finance.settlement_lines
      ADD CONSTRAINT settlement_lines_reinstated_from_void_je_same_entity_fkey
      FOREIGN KEY (operating_company_id, reinstated_from_void_je_id)
      REFERENCES accounting.journal_entries (operating_company_id, id)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE driver_finance.settlement_lines
  VALIDATE CONSTRAINT settlement_lines_reinstated_from_void_je_same_entity_fkey;

COMMIT;
