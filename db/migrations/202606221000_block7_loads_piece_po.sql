-- Block 7 — persist load piece count + customer PO number so they round-trip in the Edit wizard.
-- APPROVED by Jorge + GUARD (review artifact: docs/specs/block7-loads-piece-po-migration.md).
-- Additive, idempotent, nullable. No data backfill. New columns inherit mdata.loads' existing grants to
-- ih35_app (schema-wide GRANT ... ON ALL TABLES IN SCHEMA mdata TO ih35_app + the table grant), so no new
-- GRANT is required. Row-level audit is captured by the existing mdata.loads audit trigger (drift-capture
-- automatic for new columns). Reversible: both columns are additive/nullable.
BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS piece_count        integer NULL,
  ADD COLUMN IF NOT EXISTS customer_po_number text    NULL;

-- Guard rail (cheap, idempotent): piece_count is a non-negative count when present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loads_piece_count_nonneg'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_piece_count_nonneg
      CHECK (piece_count IS NULL OR piece_count >= 0) NOT VALID;
  END IF;
END $$;

COMMIT;
