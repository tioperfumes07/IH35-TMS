-- PERFUME item families — owner 2026-11-27 08:10 CT: "We must also have locations, families … make this more efficient and professional
-- … all must be fully wired linked".
--
-- A family is one fragrance line, the parent over its sizes, testers, sets and minis (NetSuite "matrix item" parent: it groups the
-- children, only the children are sold, stocked and costed). perfume.items.family_id links a child to its family; the family carries
-- what all its children share — brand, the scent family (olfactory family: floral, woody, amber …), gender, launch year, perfumer
-- house notes. Olfactory family is its own catalog list (kind 'olfactory_family'), seeded with the standard fragrance-wheel families;
-- he adds / renames / archives values on Catalogs or from the family form.
--
-- Policies use the once-per-query form (SELECT perfume.is_owner()) like every perfume table since 202616970100.
-- History: perfume.item_family_events (append-only: created, edited, archived, item_added, item_removed). Owner-only RLS like every
-- perfume table. Never deleted — a family is archived, and archiving is refused while items still belong to it.

BEGIN;

CREATE TABLE IF NOT EXISTS perfume.item_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  brand text CHECK (brand IS NULL OR length(brand) <= 80),
  olfactory_family text CHECK (olfactory_family IS NULL OR length(olfactory_family) <= 60),
  gender text CHECK (gender IS NULL OR gender IN ('M', 'W', 'U')),
  launch_year integer CHECK (launch_year IS NULL OR launch_year BETWEEN 1900 AND 2100),
  notes text CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_perfume_item_families_brand_name
  ON perfume.item_families (lower(btrim(coalesce(brand, ''))), lower(btrim(name))) WHERE archived_at IS NULL;

ALTER TABLE perfume.items ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES perfume.item_families(id);
CREATE INDEX IF NOT EXISTS idx_perfume_items_family ON perfume.items (family_id) WHERE family_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS perfume.item_family_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES perfume.item_families(id),
  kind text NOT NULL CHECK (kind IN ('created', 'edited', 'archived', 'item_added', 'item_removed')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detail) = 'object'),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS idx_perfume_item_family_events_family ON perfume.item_family_events (family_id, created_at);

ALTER TABLE perfume.item_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.item_families FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_families_owner_only ON perfume.item_families;
CREATE POLICY item_families_owner_only ON perfume.item_families USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()));
GRANT SELECT, INSERT, UPDATE ON perfume.item_families TO ih35_app;

ALTER TABLE perfume.item_family_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.item_family_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_family_events_owner_only ON perfume.item_family_events;
CREATE POLICY item_family_events_owner_only ON perfume.item_family_events USING ((SELECT perfume.is_owner())) WITH CHECK ((SELECT perfume.is_owner()));
GRANT SELECT, INSERT ON perfume.item_family_events TO ih35_app;

-- Item history gains 'family' (an item joined / left a family). Superset of 202617010100's list.
ALTER TABLE perfume.item_events DROP CONSTRAINT IF EXISTS item_events_kind_check;
ALTER TABLE perfume.item_events ADD CONSTRAINT item_events_kind_check
  CHECK (kind IN ('edited', 'tio_code', 'upc_added', 'upc_moved_in', 'upc_moved_out', 'hk_code_added', 'hk_code_moved_in', 'hk_code_moved_out',
                  'line_linked', 'codes_filled', 'attributes', 'created', 'family'));

-- Olfactory families: a catalog list of their own (superset of 202617020100's kinds).
ALTER TABLE perfume.catalog_values DROP CONSTRAINT IF EXISTS catalog_values_kind_check;
ALTER TABLE perfume.catalog_values ADD CONSTRAINT catalog_values_kind_check
  CHECK (kind IN ('vendor_type', 'customer_type', 'category', 'segment', 'source_kind', 'product_type', 'gender', 'item_category', 'olfactory_family'));
INSERT INTO perfume.catalog_values (kind, value, sort)
SELECT 'olfactory_family', t.v, t.s
  FROM (VALUES ('Floral', 10), ('Woody', 20), ('Amber / Oriental', 30), ('Fresh', 40), ('Citrus', 50), ('Aromatic / Fougère', 60),
               ('Chypre', 70), ('Gourmand', 80), ('Aquatic', 90), ('Fruity', 100), ('Leather', 110), ('Spicy', 120)) AS t(v, s)
 WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = 'olfactory_family' AND lower(btrim(x.value)) = lower(t.v) AND x.archived_at IS NULL);

COMMIT;
