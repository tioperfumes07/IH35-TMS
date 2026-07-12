-- [HOLD-FOR-JORGE — TIER 1] JE-VOID Option 1 (NetSuite/QBO reversing-entry model). accounting.* schema
-- change → financial cluster, PROTECTED, gated. NEVER self-merge; owner merges the HOLD PR.
-- DO NOT RUN ON PROD — this migration runs ONLY on a Neon branch by Jorge's hand, then is ledger-backfilled
-- so prod db:migrate skips it (the held-migration firewall + registry enforce this at execution time).
--
-- WHY: voiding a posted journal entry must NEVER mutate/flip the original (the GL reports exclude
-- status='voided', so a flip silently drops the entry). Instead it posts a linked REVERSING JE and leaves
-- the original status='posted'. This adds the bidirectional JE-level linkage the model requires:
--   original.reversed_by_je_id -> reversal.id   AND   reversal.reverses_je_id -> original.id
-- (Line-level reversal links already exist on journal_entry_postings from 0195; this is the header link.)
--
-- Additive only. Idempotent (ADD COLUMN IF NOT EXISTS + FK guarded). Same table → inherits the existing
-- FORCE RLS + entity policies (no new grants needed; journal_entries already granted to ih35_app).

BEGIN;

ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS reversed_by_je_id uuid,
  ADD COLUMN IF NOT EXISTS reverses_je_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_je_reversed_by_je_id' AND conrelid = 'accounting.journal_entries'::regclass) THEN
    ALTER TABLE accounting.journal_entries
      ADD CONSTRAINT fk_je_reversed_by_je_id FOREIGN KEY (reversed_by_je_id) REFERENCES accounting.journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_je_reverses_je_id' AND conrelid = 'accounting.journal_entries'::regclass) THEN
    ALTER TABLE accounting.journal_entries
      ADD CONSTRAINT fk_je_reverses_je_id FOREIGN KEY (reverses_je_id) REFERENCES accounting.journal_entries(id);
  END IF;
END $$;

-- A JE reverses at most one original; an original is reversed by at most one JE (prevents double-reversal
-- at the schema level too).
CREATE UNIQUE INDEX IF NOT EXISTS uq_je_reverses_je_id
  ON accounting.journal_entries (reverses_je_id) WHERE reverses_je_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_je_reversed_by_je_id
  ON accounting.journal_entries (reversed_by_je_id) WHERE reversed_by_je_id IS NOT NULL;

COMMIT;
