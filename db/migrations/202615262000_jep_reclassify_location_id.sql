-- CLAIM 202615262000 — BANK-F91052 B-5 Change location (ORDERS §B-5 / QBO Tools→Reclassify).
--
-- LIVE (Neon tiny-field-89581227 / br-fancy-credit-akjnd07a, 2026-10-02, bypass_rls=lucia):
--   accounting.journal_entry_postings has class_id; location_id ABSENT.
--   accounting.reclassify_batches has to_account_id / to_class_id / to_entity_*; to_location_id ABSENT.
--   mdata.locations exists (622 USMCA rows).
--
-- Additive · idempotent · CREATE-only · no DROP of money · no QBO write-back.
-- Cursor HH 12–23.

BEGIN;

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS location_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('mdata.locations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'journal_entry_postings_location_id_fkey'
        AND conrelid = 'accounting.journal_entry_postings'::regclass
    ) THEN
      ALTER TABLE accounting.journal_entry_postings
        ADD CONSTRAINT journal_entry_postings_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES mdata.locations(id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN accounting.journal_entry_postings.location_id IS
  'Optional QBO Location reporting dimension (mdata.locations). Nullable. B-5 reclassify Change location.';

ALTER TABLE accounting.reclassify_batches
  ADD COLUMN IF NOT EXISTS to_location_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('mdata.locations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'reclassify_batches_to_location_id_fkey'
        AND conrelid = 'accounting.reclassify_batches'::regclass
    ) THEN
      ALTER TABLE accounting.reclassify_batches
        ADD CONSTRAINT reclassify_batches_to_location_id_fkey
        FOREIGN KEY (to_location_id) REFERENCES mdata.locations(id);
    END IF;
  END IF;
END $$;

ALTER TABLE accounting.reclassify_batches
  DROP CONSTRAINT IF EXISTS reclassify_batches_changes_something;
ALTER TABLE accounting.reclassify_batches
  ADD CONSTRAINT reclassify_batches_changes_something CHECK (
    to_account_id IS NOT NULL
    OR to_class_id IS NOT NULL
    OR to_entity_uuid IS NOT NULL
    OR to_location_id IS NOT NULL
  );

ALTER TABLE accounting.reclassify_batch_lines
  ADD COLUMN IF NOT EXISTS from_location_id uuid NULL;
ALTER TABLE accounting.reclassify_batch_lines
  ADD COLUMN IF NOT EXISTS to_location_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('mdata.locations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'reclassify_batch_lines_from_location_id_fkey'
        AND conrelid = 'accounting.reclassify_batch_lines'::regclass
    ) THEN
      ALTER TABLE accounting.reclassify_batch_lines
        ADD CONSTRAINT reclassify_batch_lines_from_location_id_fkey
        FOREIGN KEY (from_location_id) REFERENCES mdata.locations(id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'reclassify_batch_lines_to_location_id_fkey'
        AND conrelid = 'accounting.reclassify_batch_lines'::regclass
    ) THEN
      ALTER TABLE accounting.reclassify_batch_lines
        ADD CONSTRAINT reclassify_batch_lines_to_location_id_fkey
        FOREIGN KEY (to_location_id) REFERENCES mdata.locations(id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN accounting.reclassify_batches.to_location_id IS
  'B-5 Change location target (mdata.locations). NULL = leave location unchanged.';

COMMIT;
