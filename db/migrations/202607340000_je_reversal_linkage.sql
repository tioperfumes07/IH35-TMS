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
-- Additive only. Idempotent (ADD COLUMN IF NOT EXISTS carries the inline, named self-ref FK, so a re-run
-- skips column + constraint together). Same table → inherits the existing FORCE RLS + entity policies
-- (no new grants needed; journal_entries already granted to ih35_app).

BEGIN;

-- Inline, NAMED self-referential FKs (not a separate ADD CONSTRAINT block) so the orphan-FK ratchet sees
-- the REFERENCES on the column definition and the constraint is created atomically with the column.
ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS reversed_by_je_id uuid
    CONSTRAINT fk_je_reversed_by_je_id REFERENCES accounting.journal_entries(id),
  ADD COLUMN IF NOT EXISTS reverses_je_id uuid
    CONSTRAINT fk_je_reverses_je_id REFERENCES accounting.journal_entries(id);

-- A JE reverses at most one original; an original is reversed by at most one JE (prevents double-reversal
-- at the schema level too).
CREATE UNIQUE INDEX IF NOT EXISTS uq_je_reverses_je_id
  ON accounting.journal_entries (reverses_je_id) WHERE reverses_je_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_je_reversed_by_je_id
  ON accounting.journal_entries (reversed_by_je_id) WHERE reversed_by_je_id IS NOT NULL;

COMMIT;
