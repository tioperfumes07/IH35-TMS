-- PERFUME item attributes — owner 2026-11-27 07:22 CT: "in item profile we need to be able to edit … each data they appear in the
-- lists, brand model type category size edt esp parfume etc description etc, and in items list should have multiple selector as well
-- to edit in mass and bulk".
--
-- perfume.items already carries brand, name, size_ml, conc (EDT / EDP / PARFUM …), gender and flags. Added here, all nullable and
-- descriptive (they are NOT part of identity_key, so editing them never merges or splits an item):
--   model        — the line / model name as he says it (e.g. "Queen of Seduction")
--   product_type — perfume.catalog_values kind 'product_type' (Tester, Man, Woman, Man Set, Woman Set, Body Mist …)
--   category     — perfume.catalog_values kind 'category' (Perfume, Cosmetics …)
--   description  — his own words for the item
-- Every change is written to perfume.item_events by the service (who, when, from, to). Additive only; nothing is backfilled.

BEGIN;

ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS model text;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS product_type text;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS description text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'perfume_items_attr_len') THEN
    ALTER TABLE perfume.items ADD CONSTRAINT perfume_items_attr_len CHECK (
      (model IS NULL OR length(model) <= 120) AND (product_type IS NULL OR length(product_type) <= 60)
      AND (category IS NULL OR length(category) <= 60) AND (description IS NULL OR length(description) <= 2000));
  END IF;
END $$;

-- Widen the item history kinds with 'attributes' (one event per save of model / type / category / description). Superset of the
-- existing list, so every existing row still passes.
ALTER TABLE perfume.item_events DROP CONSTRAINT IF EXISTS item_events_kind_check;
ALTER TABLE perfume.item_events ADD CONSTRAINT item_events_kind_check
  CHECK (kind IN ('edited', 'tio_code', 'upc_added', 'upc_moved_in', 'upc_moved_out', 'hk_code_added', 'hk_code_moved_in', 'hk_code_moved_out',
                  'line_linked', 'codes_filled', 'attributes'));

CREATE INDEX IF NOT EXISTS idx_perfume_items_product_type ON perfume.items (product_type) WHERE product_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_perfume_items_category ON perfume.items (category) WHERE category IS NOT NULL;

COMMIT;
