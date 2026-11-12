-- PERFUME-DESK tier 5b (2026-11-12): competitor lists with no barcode (La Esperanza) link a line to the ONE item
-- with the same name words + bottle size + flags whose brand/type/gender agree with what the line prints.
-- The row records that method as 'name'. Isolated perfume schema; no money, no GL. Idempotent.
ALTER TABLE perfume.price_list_rows DROP CONSTRAINT IF EXISTS price_list_rows_match_method_check;
ALTER TABLE perfume.price_list_rows ADD CONSTRAINT price_list_rows_match_method_check
  CHECK (match_method IN ('upc', 'sku', 'alias', 'key', 'loose_key', 'name', 'new_item', 'confirmed'));
