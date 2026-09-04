-- WIZ-24 — load commodity catalog. The Book Load "Commodity" combobox calls
-- GET /api/v1/catalogs/dispatch/load-commodities, served by the SAME generic dispatch-catalog route
-- factory (apps/backend/src/catalogs/dispatch/shared.ts registerDispatchCatalogCrudRoutes) with
-- tableName "load_commodities". The route was registered but catalogs.load_commodities was NEVER
-- created, so the query failed and the endpoint returned an error (the SPA fallback served HTML) —
-- "Could not load commodities." This migration creates the table so the endpoint returns JSON.
--
-- Mirrors catalogs.historical_import_reasons / catalogs.detention_reasons EXACTLY: same column shape,
-- same FORCED RLS company_scope + lucia_bypass(SELECT) policies, same grant set. Idempotent and
-- CREATE-only (IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT DO NOTHING) — safe to re-run,
-- never DROPs. No FK to mdata.loads: the free-text mdata.loads.commodity column and its Book Load
-- write path are UNCHANGED; the catalog only supplies canned commodity TEXT the office can pick then
-- refine, exactly like the sibling dispatch quick-pick catalogs.

CREATE TABLE IF NOT EXISTS catalogs.load_commodities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  code text NOT NULL,
  display_name text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT load_commodities_operating_company_id_code_key UNIQUE (operating_company_id, code),
  CONSTRAINT load_commodities_id_company_unique UNIQUE (id, operating_company_id)
);

CREATE INDEX IF NOT EXISTS idx_load_commodities_company_active
  ON catalogs.load_commodities (operating_company_id, is_active);

ALTER TABLE catalogs.load_commodities ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.load_commodities FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_scope ON catalogs.load_commodities;
CREATE POLICY company_scope ON catalogs.load_commodities
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

DROP POLICY IF EXISTS load_commodities_lucia_bypass ON catalogs.load_commodities;
CREATE POLICY load_commodities_lucia_bypass ON catalogs.load_commodities
  FOR SELECT
  USING (identity.is_lucia_bypass());

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.load_commodities TO ih35_app;

-- Seed a USMCA cross-border trucking starter set per active company so the picker is not empty on day
-- one. This is catalog reference text (never is_sample_data): the office picks then refines, and adds
-- more via the picker's own "+ Create" (the same generic-catalog POST this seed exercises). Codes match
-- the create route's /^[A-Z][A-Z0-9-]+$/ contract.
INSERT INTO catalogs.load_commodities (operating_company_id, code, display_name, sort_order)
SELECT c.id, v.code, v.display_name, v.sort_order
FROM org.companies c
CROSS JOIN (VALUES
  ('GENERAL-FREIGHT', 'General freight', 10),
  ('AUTO-PARTS', 'Automotive parts', 20),
  ('AUTOMOTIVE', 'Automotive & finished vehicles', 30),
  ('PRODUCE', 'Fresh produce', 40),
  ('REFRIGERATED-FOODS', 'Refrigerated foods', 50),
  ('FROZEN-FOODS', 'Frozen foods', 60),
  ('BEVERAGES', 'Beverages', 70),
  ('PACKAGED-FOODS', 'Packaged foods & grocery', 80),
  ('CONSUMER-GOODS', 'Consumer & retail goods', 90),
  ('ELECTRONICS', 'Electronics', 100),
  ('APPLIANCES', 'Appliances', 110),
  ('BUILDING-MATERIALS', 'Building materials', 120),
  ('STEEL-METAL', 'Steel & metal products', 130),
  ('MACHINERY', 'Machinery & equipment', 140),
  ('PLASTICS-RESINS', 'Plastics & resins', 150),
  ('PAPER-PACKAGING', 'Paper & packaging', 160),
  ('TEXTILES-APPAREL', 'Textiles & apparel', 170),
  ('FURNITURE', 'Furniture', 180),
  ('LUMBER-WOOD', 'Lumber & wood products', 190),
  ('CHEMICALS-NONHAZ', 'Chemicals (non-hazardous)', 200)
) AS v(code, display_name, sort_order)
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, code) DO NOTHING;
