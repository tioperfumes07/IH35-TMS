-- ACCT-F11152 follow-up (batch82 2026-11-10): settlement_lines.reinstated_from_void_je_id was added
-- in 202616390100 with a single-column FK to accounting.journal_entries(id) but WITHOUT the matching
-- composite same-entity FK (operating_company_id, reinstated_from_void_je_id) → journal_entries.
-- Phase 2 (202615330904) already covered void_reversal_entry_id; this column was added after phase 2
-- and was missed. The verify-money-lines-same-entity-fks guard (ROUND 345) fails without this.
--
-- Migration number: 202616480100 (CC-1 band HH=01; claimed in CLAIMED-MIGRATION-NUMBERS.json)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'driver_finance.settlement_lines'::regclass
       AND conname  = 'settlement_lines_reinstated_je_same_entity_fkey'
  ) THEN
    ALTER TABLE driver_finance.settlement_lines
      ADD CONSTRAINT settlement_lines_reinstated_je_same_entity_fkey
        FOREIGN KEY (operating_company_id, reinstated_from_void_je_id)
          REFERENCES accounting.journal_entries (operating_company_id, id)
          NOT VALID;
  END IF;
END $$;
ALTER TABLE driver_finance.settlement_lines
  VALIDATE CONSTRAINT settlement_lines_reinstated_je_same_entity_fkey;
