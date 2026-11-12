-- 202616490100_perfume_desk_isolated_schema.sql
-- PERFUME-DESK (owner order 2026-11-11/12). An owner-only, hidden price desk for TIO Perfumes
-- (ScentsX LLC), isolated from every carrier: its own schema `perfume`, no operating_company_id, no
-- reference to org.companies, mdata.*, accounting.* or any USMCA/TRANSPORTATION/TRUCKING row, and it
-- never posts to the GL. The only outside reference is identity.users (who imported / confirmed).
-- Self-contained on purpose so the owner can lift it into its own software later (pg_dump -n perfume).
--
-- Identity model: one perfume.items row per bottle; MANY UPCs per item (new packaging, country
-- editions); MANY vendor spellings/SKUs per item (perfume.item_aliases). Prices are integer cents.
-- Every imported line keeps its file, sheet and row number, so any number traces to its source.
--
-- Access: ONLY the users listed in perfume.desk_users (seeded with the owner's own login, owner order
-- "at the moment it would only be me") AND holding the Owner role on an active account. Other Owner-role
-- users of IH35-TMS (9 on prod 2026-11-12) do NOT see this desk. FORCE RLS everywhere. Lucia bypass for
-- migrations/ops reads.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL app.bypass_rls = 'lucia';

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS perfume;
GRANT USAGE ON SCHEMA perfume TO ih35_app;

-- Who may open the desk. Rows are added by the owner (ops write under Lucia bypass); the app can only read
-- its own row, so no user can grant themselves access.
CREATE TABLE IF NOT EXISTS perfume.desk_users (
  user_id uuid PRIMARY KEY REFERENCES identity.users(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  note text
);
ALTER TABLE perfume.desk_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.desk_users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS desk_users_self_only ON perfume.desk_users;
CREATE POLICY desk_users_self_only ON perfume.desk_users
  USING (identity.is_lucia_bypass() OR user_id = identity.current_user_id())
  WITH CHECK (identity.is_lucia_bypass());
GRANT SELECT ON perfume.desk_users TO ih35_app;

INSERT INTO perfume.desk_users (user_id, note)
SELECT u.id, 'owner login — the only perfume desk user (owner order 2026-11-11)'
FROM identity.users u
WHERE lower(u.email) = 'tioperfumes07@gmail.com' AND u.role::text = 'Owner' AND u.deactivated_at IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- current_user_role() already returns NULL for a deactivated account.
CREATE OR REPLACE FUNCTION perfume.is_owner() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT identity.is_lucia_bypass()
        OR (identity.current_user_role()::text = 'Owner'
            AND EXISTS (SELECT 1 FROM perfume.desk_users d WHERE d.user_id = identity.current_user_id()))
  $$;

-- Vendors and Laredo sellers. kind: buy (I buy from them), sell (I compare/sell against them), both.
CREATE TABLE IF NOT EXISTS perfume.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'buy' CHECK (kind IN ('buy', 'sell', 'both')),
  cushion_lo_cents integer CHECK (cushion_lo_cents IS NULL OR cushion_lo_cents >= 0),
  cushion_hi_cents integer CHECK (cushion_hi_cents IS NULL OR cushion_hi_cents >= 0),
  freight_lo_cents integer CHECK (freight_lo_cents IS NULL OR freight_lo_cents >= 0),
  freight_hi_cents integer CHECK (freight_hi_cents IS NULL OR freight_hi_cents >= 0),
  earn_pct numeric(6,3) CHECK (earn_pct IS NULL OR (earn_pct >= 0 AND earn_pct < 100)),
  sells_by_box boolean NOT NULL DEFAULT false,
  contact text,
  column_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_uq ON perfume.vendors (lower(name)) WHERE archived_at IS NULL;

-- One row per bottle.
CREATE TABLE IF NOT EXISTS perfume.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code text,
  brand text NOT NULL DEFAULT '',
  name text NOT NULL,
  size_ml numeric(7,2),
  conc text NOT NULL DEFAULT '' CHECK (conc IN ('', 'EDT', 'EDP', 'PARFUM', 'EXTRAIT', 'EDC', 'MIST')),
  gender text NOT NULL DEFAULT '' CHECK (gender IN ('', 'M', 'W', 'U')),
  flags text[] NOT NULL DEFAULT '{}',
  identity_key text NOT NULL,
  loose_key text NOT NULL,
  display_name text NOT NULL,
  merged_into_id uuid REFERENCES perfume.items(id),
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS items_identity_key_uq ON perfume.items (identity_key) WHERE merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS items_loose_key ON perfume.items (loose_key) WHERE merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS items_name_trgm ON perfume.items USING gin (name gin_trgm_ops);
CREATE UNIQUE INDEX IF NOT EXISTS items_internal_code_uq ON perfume.items (internal_code) WHERE internal_code IS NOT NULL AND merged_into_id IS NULL;

-- Brand short forms the owner teaches the desk ("CH" → "CAROLINA HERRERA").
CREATE TABLE IF NOT EXISTS perfume.brand_aliases (
  alias text PRIMARY KEY,
  brand text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A dated price list from one vendor; the original file is kept in R2.
CREATE TABLE IF NOT EXISTS perfume.price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES perfume.vendors(id),
  list_date date NOT NULL,
  label text,
  file_name text NOT NULL,
  file_r2_key text,
  file_sha256 text,
  source_kind text NOT NULL CHECK (source_kind IN ('xlsx', 'xls', 'csv', 'pdf_text', 'image', 'manual')),
  rows_read integer NOT NULL CHECK (rows_read >= 0),
  rows_saved integer NOT NULL CHECK (rows_saved >= 0),
  rows_skipped integer NOT NULL CHECK (rows_skipped >= 0),
  price_total_file_cents bigint NOT NULL,
  price_total_saved_cents bigint NOT NULL,
  is_current boolean NOT NULL DEFAULT true,
  voided_at timestamptz,
  void_reason text,
  imported_by uuid REFERENCES identity.users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_lists_counts_add_up CHECK (rows_read = rows_saved + rows_skipped),
  CONSTRAINT price_lists_void_needs_reason CHECK (voided_at IS NULL OR (void_reason IS NOT NULL AND btrim(void_reason) <> ''))
);
CREATE INDEX IF NOT EXISTS price_lists_vendor_current ON perfume.price_lists (vendor_id, list_date DESC) WHERE voided_at IS NULL;

-- Many UPCs per item. A UPC belongs to exactly one item.
CREATE TABLE IF NOT EXISTS perfume.item_upcs (
  upc text PRIMARY KEY CHECK (upc ~ '^[1-9][0-9]{7,13}$'),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  first_seen_list_id uuid REFERENCES perfume.price_lists(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS item_upcs_item ON perfume.item_upcs (item_id);

-- Every priced line, as read, with where it came from and what it matched.
CREATE TABLE IF NOT EXISTS perfume.price_list_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES perfume.price_lists(id),
  sheet text,
  row_no integer NOT NULL,
  raw jsonb NOT NULL,
  upc text,
  sku text,
  brand text,
  description text NOT NULL,
  size_text text,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  qty integer,
  case_pack integer,
  identity_key text NOT NULL,
  loose_key text NOT NULL,
  item_id uuid REFERENCES perfume.items(id),
  match_method text CHECK (match_method IN ('upc', 'sku', 'alias', 'key', 'loose_key', 'new_item', 'confirmed')),
  match_status text NOT NULL CHECK (match_status IN ('matched', 'review', 'unmatched')),
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_list_rows_matched_has_item CHECK ((match_status = 'matched') = (item_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS price_list_rows_list ON perfume.price_list_rows (list_id, row_no);
CREATE INDEX IF NOT EXISTS price_list_rows_item ON perfume.price_list_rows (item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS price_list_rows_review ON perfume.price_list_rows (list_id) WHERE match_status <> 'matched';

-- A vendor's own spelling / SKU of an item, confirmed once and reused on every later list.
CREATE TABLE IF NOT EXISTS perfume.item_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES perfume.items(id),
  vendor_id uuid NOT NULL REFERENCES perfume.vendors(id),
  sku text,
  text_key text,
  method text NOT NULL CHECK (method IN ('import', 'confirmed')),
  confirmed_by uuid REFERENCES identity.users(id),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT item_aliases_has_handle CHECK (sku IS NOT NULL OR text_key IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS item_aliases_vendor_sku_uq ON perfume.item_aliases (vendor_id, sku) WHERE sku IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS item_aliases_vendor_text_uq ON perfume.item_aliases (vendor_id, text_key) WHERE text_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS item_aliases_item ON perfume.item_aliases (item_id);

-- What I need to buy (the old workbook's "My Needs List").
CREATE TABLE IF NOT EXISTS perfume.needs (
  item_id uuid PRIMARY KEY REFERENCES perfume.items(id),
  qty integer NOT NULL CHECK (qty > 0),
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Desk rules: rounding, default cushion/freight, earn %, column choices. One row.
CREATE TABLE IF NOT EXISTS perfume.settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES identity.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Owner-only on every table. No DELETE grant anywhere: lists are voided, items merged, never deleted —
-- except needs (a shopping list line is removed when bought) and brand_aliases (a wrong short form).
-- One explicit block per table (no dynamic SQL) so every guard can read each grant and policy.
ALTER TABLE perfume.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.vendors FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_owner_only ON perfume.vendors;
CREATE POLICY vendors_owner_only ON perfume.vendors USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.vendors TO ih35_app;

ALTER TABLE perfume.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS items_owner_only ON perfume.items;
CREATE POLICY items_owner_only ON perfume.items USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.items TO ih35_app;

ALTER TABLE perfume.item_upcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.item_upcs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_upcs_owner_only ON perfume.item_upcs;
CREATE POLICY item_upcs_owner_only ON perfume.item_upcs USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.item_upcs TO ih35_app;

ALTER TABLE perfume.brand_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.brand_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS brand_aliases_owner_only ON perfume.brand_aliases;
CREATE POLICY brand_aliases_owner_only ON perfume.brand_aliases USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.brand_aliases TO ih35_app;

ALTER TABLE perfume.price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.price_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_lists_owner_only ON perfume.price_lists;
CREATE POLICY price_lists_owner_only ON perfume.price_lists USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.price_lists TO ih35_app;

ALTER TABLE perfume.price_list_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.price_list_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS price_list_rows_owner_only ON perfume.price_list_rows;
CREATE POLICY price_list_rows_owner_only ON perfume.price_list_rows USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.price_list_rows TO ih35_app;

ALTER TABLE perfume.item_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.item_aliases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_aliases_owner_only ON perfume.item_aliases;
CREATE POLICY item_aliases_owner_only ON perfume.item_aliases USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.item_aliases TO ih35_app;

ALTER TABLE perfume.needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.needs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS needs_owner_only ON perfume.needs;
CREATE POLICY needs_owner_only ON perfume.needs USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.needs TO ih35_app;

ALTER TABLE perfume.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfume.settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settings_owner_only ON perfume.settings;
CREATE POLICY settings_owner_only ON perfume.settings USING (perfume.is_owner()) WITH CHECK (perfume.is_owner());
GRANT SELECT, INSERT, UPDATE ON perfume.settings TO ih35_app;
GRANT DELETE ON perfume.needs, perfume.brand_aliases TO ih35_app;
GRANT EXECUTE ON FUNCTION perfume.is_owner() TO ih35_app;

INSERT INTO perfume.settings (id, rules) VALUES (1, jsonb_build_object(
  'round_step', '50', 'round_dir', 'up',
  'cushion_lo_cents', 25, 'cushion_hi_cents', 50,
  'freight_lo_cents', 35, 'freight_hi_cents', 45,
  'vendor_earn_pct', 16, 'store_earn_pct', 16,
  'wholesale_targets_pct', jsonb_build_array(11, 12.5, 15)
)) ON CONFLICT (id) DO NOTHING;

COMMENT ON SCHEMA perfume IS 'PERFUME-DESK: TIO Perfumes (ScentsX LLC) price desk. Owner-only, isolated from all carrier data; never posts to the GL.';

COMMIT;
