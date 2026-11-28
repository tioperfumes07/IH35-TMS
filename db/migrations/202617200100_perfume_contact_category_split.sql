-- PERFUME contact category split — owner 2026-11-27 16:54 CT: "you need to have header for each type and not confuse, such as categories,
-- what type of categories? … separate all the types and categories we need in the app right now … and lets create those individual
-- catalogs, not mix"; 17:35 CT: "i think we need to check on many htings the type and sub type"; 17:17 CT: "country of origin … a correct
-- catalog for all items".
--
-- Measured on production 2026-11-27: the contacts' 'category' list (24 values) mixed three things —
--   * the RELATIONSHIP (Potential customer, Customer, Supplier / Brand, Other business contact) — perfume.contact_companies.main_category;
--   * the INDUSTRY (Perfume 641, Cosmetics 707, Beer 333, Liquor 193, Tobacco 150, Duty free 62 …) — contact_companies.categories[];
--   * REVIEW NOTES left by the phone / directory imports ("Phone: likely distributor (NJ/NY/FL/CA area code)" 50, "Phone: Mexico - review"
--     11, "US - OTHER", "International contact" 130) and the "(Market Directory)" copies of two relationships (816 + 94).
--
-- This migration is schema + catalog only (no company data changes):
--   1) contact_companies.review_tags text[] — the review notes get their own place;
--   2) catalog kinds 'industry', 'review_tag', 'origin_country' (item country of origin, perfume.items.origin_country);
--   3) the industry values and the review-note values move to their own lists (catalog_values.kind), 'Market Directory' added as a
--      review tag, and a starting country-of-origin list.
-- Moving each COMPANY's values (main_category / categories → review_tags; "(Market Directory)" → the relationship + the tag) is done by
-- the owner from Catalogs → "Clean up the catalogs" (preview → Apply, one history row per company). Additive, idempotent.

BEGIN;

ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS review_tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_perfume_contact_companies_review_tags ON perfume.contact_companies USING gin (review_tags);

ALTER TABLE perfume.catalog_values DROP CONSTRAINT IF EXISTS catalog_values_kind_check;
ALTER TABLE perfume.catalog_values ADD CONSTRAINT catalog_values_kind_check
  CHECK (kind IN ('vendor_type', 'customer_type', 'category', 'segment', 'source_kind', 'product_type', 'gender', 'item_category',
                  'olfactory_family', 'industry', 'review_tag', 'origin_country'));

-- Industry values: their own list (the companies keep them in categories[]).
UPDATE perfume.catalog_values SET kind = 'industry', updated_at = now()
 WHERE kind = 'category' AND archived_at IS NULL
   AND value IN ('Beer', 'Candy', 'Cosmetics', 'Duty free', 'Liquor', 'Perfume', 'Professional services', 'Shoes', 'Tobacco', 'Toys', 'Trucking / transport')
   AND NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'industry' AND lower(btrim(x.value)) = lower(btrim(catalog_values.value)) AND x.archived_at IS NULL);

-- Review notes: their own list.
UPDATE perfume.catalog_values SET kind = 'review_tag', updated_at = now()
 WHERE kind = 'category' AND archived_at IS NULL AND (value LIKE 'Phone:%' OR value IN ('US - OTHER', 'International contact'))
   AND NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'review_tag' AND lower(btrim(x.value)) = lower(btrim(catalog_values.value)) AND x.archived_at IS NULL);
INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT 'review_tag', 'Market Directory', 10
 WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'review_tag' AND lower(x.value) = 'market directory' AND x.archived_at IS NULL);

-- Item country of origin: a starting list (the owner adds / renames / archives on Catalogs; perfume.items.origin_country is empty today).
INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT 'origin_country', t.v, t.s
  FROM (VALUES ('France', 10), ('Italy', 20), ('Spain', 30), ('United States', 40), ('United Arab Emirates', 50), ('United Kingdom', 60),
               ('Germany', 70), ('Switzerland', 80), ('Mexico', 90), ('Brazil', 100), ('Netherlands', 110), ('Japan', 120), ('Korea', 130),
               ('China', 140), ('India', 150), ('Turkey', 160), ('Saudi Arabia', 170), ('Poland', 180), ('Portugal', 190), ('Canada', 200)) AS t(v, s)
 WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'origin_country' AND lower(x.value) = lower(t.v) AND x.archived_at IS NULL);

COMMIT;
