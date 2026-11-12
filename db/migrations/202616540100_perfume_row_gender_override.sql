-- PERFUME-DESK (owner 2026-11-12): "we need multiple selector to change gender" — the owner sets the gender of
-- review lines the vendor did not print it on (La Esperanza). The vendor's own text stays untouched (raw, description);
-- the owner's correction is its own column, read by the engine when it re-matches or creates the item. Idempotent.
ALTER TABLE perfume.price_list_rows ADD COLUMN IF NOT EXISTS gender_override text;
ALTER TABLE perfume.price_list_rows DROP CONSTRAINT IF EXISTS price_list_rows_gender_override_check;
ALTER TABLE perfume.price_list_rows ADD CONSTRAINT price_list_rows_gender_override_check
  CHECK (gender_override IS NULL OR gender_override IN ('M', 'W', 'U'));
