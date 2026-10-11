-- ROUND 442 replay order: 202610090300_backfill_bank_categorization_vendor.sql SETs entity_type on
-- journal_entry_postings before 202612670000 adds the column on a fresh verify:db:reset replay.
-- Additive only — full CHECK pair lands in 202612670000.

BEGIN;

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS entity_type text;

COMMIT;
