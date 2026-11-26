-- PERFUME-LEADS (owner 2026-11-26 17:38 CT: "we need to update the customers and vendors, the contacts … i need to be able to
-- filter and categorize in an excel and then upload, and then see what is not necessary … where is the lists or catalogs for
-- types … I NEED TO ALSO INCLUDE DATA FROM THE RESEARCH FROM EXPORTS IMPORTS ETC. AND THOSE SHOULD BE CATEGORIZED OR TYPE
-- FROM RESEARCH OR THE SOURCE AS A CATEGORY, THAT IS THE SOURCE WE GOT THE DATA FROM OR THE LEAD").
--
-- 1) perfume.catalog_values   — the editable type lists: vendor types, customer types, categories, business types, lead
--                               source kinds, perfume product types, genders. Seeded with the owner's own words and with every
--                               value the contacts already carry (so nothing on file reads as "unknown").
-- 2) perfume.lead_source_kind — one rule that turns where a lead came from (an origin's "how" / a company's source) into its
--                               source kind: Email · Leaked email · Phone contact · Research · customs exports / imports ·
--                               Research · BBB (US) · Research · Sección Amarilla (border towns) · Google · Trade show · …
--                               Stored as GENERATED columns, so every import gets its kind with no step to forget.
-- 3) contact_origins.sender_email / leak_no — for a leaked list: the address the leak came from and the list number.
-- 4) perfume.contact_uploads  — one Excel upload of the contacts: what it would change (kept until Apply), and what Apply did.
--
-- Isolated perfume schema (ScentsX LLC): no operating_company_id, never posts to accounting, references only perfume.* and
-- identity.users. FORCE RLS owner-only like every perfume table. No DELETE grant: rows are archived. Additive, idempotent.

CREATE OR REPLACE FUNCTION perfume.lead_source_kind(how text, source text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN how IS NULL AND source IS NULL THEN NULL
    WHEN how = 'Copied on vendor email' OR source ILIKE 'Copied by %' OR source ILIKE 'Leaked vendor list%' OR source ILIKE 'Potential customers (exposed%' THEN 'Leaked email'
    WHEN how = 'Email' OR source ILIKE 'Mailbox%' THEN 'Email'
    WHEN how ILIKE 'Phone%' OR source ILIKE 'Phone contacts%' THEN 'Phone contact'
    WHEN how = 'BBB' OR source ILIKE 'BBB%' THEN 'Research · BBB (US)'
    WHEN how ILIKE 'Secci_n Amarilla%' OR source ILIKE 'Secci_n Amarilla%' THEN 'Research · Sección Amarilla (border towns)'
    WHEN how ILIKE 'Google%' OR source = 'Google' THEN 'Google'
    WHEN coalesce(how, '') ~* '(customs|import|export|veritrade|datamyne|panjiva)' THEN 'Research · customs exports / imports'
    WHEN coalesce(how, '') ~* '(zlc|duty free|moodie|tmi|dfa|trbusiness|gtr)' THEN 'Research · duty free / trade press'
    WHEN how ILIKE 'Trade show%' THEN 'Trade show'
    WHEN how ILIKE 'LinkedIn%' OR source ILIKE 'LinkedIn%' THEN 'Research · LinkedIn'
    WHEN how ILIKE 'Market Directory%' OR source ILIKE 'Market Directory%' THEN 'Research · market directory'
    WHEN how ILIKE 'Kumar%' OR source ILIKE 'Kumar%' THEN 'Shared list (Kumar)'
    WHEN source = 'Master Database' AND how IS NULL THEN 'Email & phone (Master Database)'
    WHEN how ILIKE 'Excel%' OR source ILIKE 'Excel upload%' THEN 'Added in Excel'
    ELSE 'Research · other web'
  END
$$;

ALTER TABLE perfume.contact_origins ADD COLUMN IF NOT EXISTS source_kind text GENERATED ALWAYS AS (perfume.lead_source_kind(how, source)) STORED;
ALTER TABLE perfume.contact_origins ADD COLUMN IF NOT EXISTS sender_email text CHECK (sender_email IS NULL OR length(sender_email) <= 320);
ALTER TABLE perfume.contact_origins ADD COLUMN IF NOT EXISTS leak_no integer CHECK (leak_no IS NULL OR leak_no > 0);
ALTER TABLE perfume.contact_companies ADD COLUMN IF NOT EXISTS source_kind text GENERATED ALWAYS AS (perfume.lead_source_kind(NULL, source)) STORED;
CREATE INDEX IF NOT EXISTS contact_origins_kind_idx ON perfume.contact_origins (source_kind, company_id);

CREATE TABLE IF NOT EXISTS perfume.catalog_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('vendor_type', 'customer_type', 'category', 'segment', 'source_kind', 'product_type', 'gender')),
  value text NOT NULL CHECK (length(btrim(value)) BETWEEN 1 AND 200),
  sort integer NOT NULL DEFAULT 100,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_values_uq ON perfume.catalog_values (kind, lower(btrim(value))) WHERE archived_at IS NULL;

ALTER TABLE perfume.catalog_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.catalog_values FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalog_values_owner_only ON perfume.catalog_values;
CREATE POLICY catalog_values_owner_only ON perfume.catalog_values USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.catalog_values TO ih35_app;

CREATE TABLE IF NOT EXISTS perfume.contact_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed', 'applying', 'applied', 'failed', 'discarded')),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb,
  result jsonb,
  error text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contact_uploads_created_idx ON perfume.contact_uploads (created_at DESC);

ALTER TABLE perfume.contact_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.contact_uploads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_uploads_owner_only ON perfume.contact_uploads;
CREATE POLICY contact_uploads_owner_only ON perfume.contact_uploads USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.contact_uploads TO ih35_app;

-- Seed: the owner's own lists (tio-email-campaign / tio-perfumes notes), then every value already on file.
-- RLS is FORCED, so the migration reads/writes as the migration role with the desk bypass.
DO $$
BEGIN
  PERFORM set_config('app.bypass_rls', 'lucia', true);
  INSERT INTO perfume.catalog_values (kind, value, sort)
  SELECT k, v, s FROM (VALUES
    ('vendor_type', 'Distributor', 10), ('vendor_type', 'Trader', 20), ('vendor_type', 'Brand direct', 30),
    ('customer_type', 'Formal wholesale', 10), ('customer_type', 'Informal wholesale', 20), ('customer_type', 'Distributor', 30),
    ('customer_type', 'Retailer', 40), ('customer_type', 'Online', 50), ('customer_type', 'Duty free', 60),
    ('category', 'Perfume', 10), ('category', 'Liquor', 20), ('category', 'Tobacco', 30), ('category', 'Candy', 40),
    ('category', 'Toys', 50), ('category', 'Shoes', 60), ('category', 'Cosmetics', 70),
    ('source_kind', 'Email', 10), ('source_kind', 'Leaked email', 20), ('source_kind', 'Phone contact', 30),
    ('source_kind', 'Research · customs exports / imports', 40), ('source_kind', 'Research · BBB (US)', 50),
    ('source_kind', 'Research · Sección Amarilla (border towns)', 60), ('source_kind', 'Research · duty free / trade press', 70),
    ('source_kind', 'Research · market directory', 80), ('source_kind', 'Research · LinkedIn', 90), ('source_kind', 'Research · other web', 100),
    ('source_kind', 'Google', 110), ('source_kind', 'Trade show', 120), ('source_kind', 'Shared list (Kumar)', 130),
    ('source_kind', 'Email & phone (Master Database)', 140), ('source_kind', 'Added in Excel', 150),
    ('product_type', 'Tester', 10), ('product_type', 'Tester Man', 20), ('product_type', 'Tester Woman', 30), ('product_type', 'Man', 40),
    ('product_type', 'Woman', 50), ('product_type', 'Man Set', 60), ('product_type', 'Woman Set', 70), ('product_type', 'Body Mist', 80),
    ('gender', 'Man', 10), ('gender', 'Woman', 20), ('gender', 'Unisex', 30)
  ) AS t(k, v, s)
  WHERE NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = t.k AND lower(btrim(x.value)) = lower(btrim(t.v)) AND x.archived_at IS NULL);

  INSERT INTO perfume.catalog_values (kind, value, sort)
  SELECT DISTINCT ON (k, lower(btrim(v))) k, btrim(v), 500 FROM (
    SELECT 'vendor_type' AS k, vendor_type AS v FROM perfume.contact_companies
    UNION ALL SELECT 'customer_type', customer_type FROM perfume.contact_companies
    UNION ALL SELECT 'category', main_category FROM perfume.contact_companies
    UNION ALL SELECT 'category', unnest(categories) FROM perfume.contact_companies
    UNION ALL SELECT 'segment', segment FROM perfume.contact_companies
  ) t
  WHERE v IS NOT NULL AND length(btrim(v)) BETWEEN 1 AND 200
    AND NOT EXISTS (SELECT 1 FROM perfume.catalog_values x WHERE x.kind = t.k AND lower(btrim(x.value)) = lower(btrim(t.v)) AND x.archived_at IS NULL);
END $$;
