-- 202606242200 — Create the 19 factory catalog tables missing on prod (lists-count "full counts").
--
-- Companion to the P3 count fix (#1471 to_regclass + #1473 fleet global-scoping): those make every
-- lists-count domain return 200 with PARTIAL counts by skipping missing tables. This migration creates
-- the genuinely-missing factory catalog tables so those domains show FULL counts and their catalog
-- list/CRUD routes work. These 19 are factory-only (registered in apps/backend/src/catalogs/
-- {maintenance,fuel,fleet}/index.ts) but no migration ever created them on prod (same ledger-vs-reality
-- drift as 0062/0066/0067 — applied per ledger, objects absent). NONE are in 0062's array.
--
-- Two shapes, mirrored EXACTLY from each domain's canonical factory CREATE (NOT guessed):
--   • maintenance (8) + fuel (6): GENERIC COMPANY-SCOPED shape (0066/0067) — operating_company_id,
--     code, display_name, metadata, company_scope RLS. The maintenance/fuel factories select
--     t.display_name + t.metadata + t.operating_company_id (verified in factory.ts), so this is correct.
--   • fleet (5): GLOBAL shape (0153) — globally-unique code, `name` (NOT display_name), deactivated_at,
--     role-based RLS, NO operating_company_id. The fleet factory + tire-positions route select t.name and
--     do not company-scope (verified). This matches #1473's spec fix (fleet companyScoped:false).
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY — creates on prod (missing), no-op on
-- e2e/migrations DBs (exist). No seed data (catalogs start empty; inline "+ Add new" + future seeds fill them).
--
-- GATED (catalogs.* DDL = §1.4) → [HOLD-FOR-JORGE]: branch-test by coder; Jorge applies on a Neon branch
-- (endpoint API-verified) then prod. NEVER self-merge.

BEGIN;

-- 1) maintenance + fuel — GENERIC COMPANY-SCOPED catalogs (exact 0066/0067 shape). ─────────────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'maintenance_failure_codes', 'maintenance_labor_codes', 'maintenance_parts', 'maintenance_priority_levels',
    'maintenance_service_tasks', 'maintenance_shop_locations', 'maintenance_vendors', 'work_order_statuses',
    'fuel_card_types', 'fuel_exception_types', 'fuel_station_brands', 'fuel_stop_reason_codes', 'mpg_bands',
    'fuel_tax_jurisdictions'
  ]
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS catalogs.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        operating_company_id uuid NOT NULL REFERENCES org.companies(id),
        code text NOT NULL,
        display_name text NOT NULL,
        description text,
        metadata jsonb NOT NULL DEFAULT ''{}''::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (operating_company_id, code)
      )', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_company_active ON catalogs.%I (operating_company_id, is_active)', tbl, tbl);
    EXECUTE format('ALTER TABLE catalogs.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON catalogs.%I', tbl);
    EXECUTE format(
      'CREATE POLICY company_scope ON catalogs.%I FOR ALL TO ih35_app
       USING (operating_company_id::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (operating_company_id::text = current_setting(''app.operating_company_id'', true))', tbl);
  END LOOP;
END
$$;

-- 2) fleet — GLOBAL catalogs (exact 0153 shape: `name`, deactivated_at, role-based RLS, no company id). ─
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['tractor_statuses', 'trailer_statuses', 'asset_condition_codes', 'tire_positions', 'unit_ownership_types']
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS catalogs.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text UNIQUE NOT NULL,
        name text NOT NULL,
        description text,
        is_active boolean NOT NULL DEFAULT true,
        sort_order int NOT NULL DEFAULT 100,
        deactivated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        created_by_user_id uuid,
        updated_by_user_id uuid
      )', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_code ON catalogs.%I (code)', tbl, tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_active_sort ON catalogs.%I (is_active, sort_order) WHERE deactivated_at IS NULL', tbl, tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('ALTER TABLE catalogs.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE catalogs.%I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_all ON catalogs.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_select_all ON catalogs.%I FOR SELECT TO ih35_app USING (true)', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_admin ON catalogs.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_insert_admin ON catalogs.%I FOR INSERT TO ih35_app WITH CHECK (identity.current_user_role() IN (''Owner'', ''Administrator''))', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_admin ON catalogs.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_update_admin ON catalogs.%I FOR UPDATE TO ih35_app USING (identity.current_user_role() IN (''Owner'', ''Administrator'')) WITH CHECK (identity.current_user_role() IN (''Owner'', ''Administrator''))', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I_lucia_bypass ON catalogs.%I', tbl, tbl);
    EXECUTE format('CREATE POLICY %I_lucia_bypass ON catalogs.%I FOR ALL TO ih35_app USING (identity.is_lucia_bypass()) WITH CHECK (identity.is_lucia_bypass())', tbl, tbl);
  END LOOP;
END
$$;

COMMIT;
