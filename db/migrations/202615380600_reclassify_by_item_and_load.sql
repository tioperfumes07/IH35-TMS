-- 202615380600_reclassify_by_item_and_load.sql
-- U24 (owner UI register 2026-10-03, CC-2) — "Reclassify: three selectors — by account, by item, by load".
-- The register already FILTERS by account, item and load; the engine could only MOVE a line's account / class /
-- location / entity. An item move ("Diesel -> Reefer Diesel") and a load move ("13515 -> 13520") need the batch to
-- record what it moved, so the batch can be audited and undone exactly:
--   * accounting.reclassify_batches.to_item_id / to_load_id — the batch's targets
--   * accounting.reclassify_batch_lines.from_item_id / to_item_id / from_load_id / to_load_id — per line, before and after
-- An item move carries the item's own expense account (the ledger moves with it through the reclass entry); a load move
-- re-stamps the reclass entry's legs — the reversing leg keeps the old load, the reposting leg carries the new one
-- (LAW 363.3: a reclassify by load re-stamps the posting's load).
-- ADDITIVE + IDEMPOTENT. No data written. FKs are NOT VALID (no full-table validation scan on add).

BEGIN;

SET LOCAL search_path TO pg_catalog, public;
SET LOCAL lock_timeout = '15s';

ALTER TABLE accounting.reclassify_batches
  ADD COLUMN IF NOT EXISTS to_item_id uuid,
  ADD COLUMN IF NOT EXISTS to_load_id uuid;

ALTER TABLE accounting.reclassify_batch_lines
  ADD COLUMN IF NOT EXISTS from_item_id uuid,
  ADD COLUMN IF NOT EXISTS to_item_id uuid,
  ADD COLUMN IF NOT EXISTS from_load_id uuid,
  ADD COLUMN IF NOT EXISTS to_load_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reclassify_batches_to_item_fkey') THEN
    ALTER TABLE accounting.reclassify_batches ADD CONSTRAINT reclassify_batches_to_item_fkey FOREIGN KEY (to_item_id) REFERENCES catalogs.items(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reclassify_batches_to_load_fkey') THEN
    ALTER TABLE accounting.reclassify_batches ADD CONSTRAINT reclassify_batches_to_load_fkey FOREIGN KEY (to_load_id) REFERENCES mdata.loads(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reclassify_batch_lines_to_item_fkey') THEN
    ALTER TABLE accounting.reclassify_batch_lines ADD CONSTRAINT reclassify_batch_lines_to_item_fkey FOREIGN KEY (to_item_id) REFERENCES catalogs.items(id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reclassify_batch_lines_to_load_fkey') THEN
    ALTER TABLE accounting.reclassify_batch_lines ADD CONSTRAINT reclassify_batch_lines_to_load_fkey FOREIGN KEY (to_load_id) REFERENCES mdata.loads(id) NOT VALID;
  END IF;
END $$;

COMMIT;
