-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] ACCT-LINK-01 — wire catalogs.journal_entry_types → accounting.journal_entries
--
-- *** DO NOT RUN ON PROD. DO NOT self-merge as "done". ***
-- Owner Neon-apply + ledger-backfill required. Touches accounting.journal_entries (financial cluster).
-- Additive/idempotent. No GL math.
--
-- ROOT CAUSE: AF-5 created the JE types catalog as metadata-only (explicitly "no FK from any posting/
-- GL table"). Live Neon: 16 catalog rows, 0 inbound FKs; journal_entries has no type column → island.
--
-- FIX (additive only):
--   nullable journal_entry_type_id uuid REFERENCES catalogs.journal_entry_types(id)
-- Manual JE create path writes GENERAL (or caller-supplied type) when the column is present
-- (col-gated expand/contract until this migration lands on Neon).
-- Auto/poster paths may leave NULL until mapped — inbound FK density grows with manual + future maps.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = 'accounting'
       AND table_name = 'journal_entries'
       AND column_name = 'journal_entry_type_id'
  ) THEN
    ALTER TABLE accounting.journal_entries
      ADD COLUMN journal_entry_type_id uuid REFERENCES catalogs.journal_entry_types (id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_journal_entries_type_id
  ON accounting.journal_entries (journal_entry_type_id)
  WHERE journal_entry_type_id IS NOT NULL;

COMMIT;
