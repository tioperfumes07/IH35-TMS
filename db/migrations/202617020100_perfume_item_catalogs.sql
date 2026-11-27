-- PERFUME item catalogs — owner 2026-11-27 07:51 CT: items get their own category list ("Yes they do"), "we need the creator for lists
-- and catalogs etc", "All fully wired linked etc".
--
-- perfume.catalog_values gains kind 'item_category' (the list the item creator / editor / bulk bar offer for an item's category), next
-- to the existing 'product_type'. The contacts' 'category' list (Perfume, Liquor, Tobacco, Candy, Toys, Shoes, Cosmetics …) stays the
-- contacts' list. Seeded with the two item-relevant values already in his category list (Perfume, Cosmetics) plus every category
-- already typed on an item, so nothing an item carries is missing from its list. He adds, renames (items follow) and archives values
-- on Catalogs or straight from the item creator. Idempotent.

BEGIN;

ALTER TABLE perfume.catalog_values DROP CONSTRAINT IF EXISTS catalog_values_kind_check;
ALTER TABLE perfume.catalog_values ADD CONSTRAINT catalog_values_kind_check
  CHECK (kind IN ('vendor_type', 'customer_type', 'category', 'segment', 'source_kind', 'product_type', 'gender', 'item_category'));

INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT 'item_category', t.v, t.s
  FROM (VALUES ('Perfume', 10), ('Cosmetics', 20)) AS t(v, s)
 WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'item_category' AND lower(btrim(x.value)) = lower(t.v) AND x.archived_at IS NULL);

INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT DISTINCT ON (lower(btrim(i.category))) 'item_category', btrim(i.category), 500
  FROM perfume.items i
 WHERE i.category IS NOT NULL AND btrim(i.category) <> '' AND i.merged_into_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'item_category' AND lower(btrim(x.value)) = lower(btrim(i.category)) AND x.archived_at IS NULL);

INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT DISTINCT ON (lower(btrim(i.product_type))) 'product_type', btrim(i.product_type), 500
  FROM perfume.items i
 WHERE i.product_type IS NOT NULL AND btrim(i.product_type) <> '' AND i.merged_into_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'product_type' AND lower(btrim(x.value)) = lower(btrim(i.product_type)) AND x.archived_at IS NULL);

COMMIT;
