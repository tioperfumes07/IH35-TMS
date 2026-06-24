-- 202606241100 — W-2 (c): ensure the dispatch catalog TABLES exist (prod migration-deployment drift).
--
-- GUARD live (via #1459 pg_code): GET /api/v1/catalogs/dispatch/{additional-charges,load-types,
-- detention-reasons,pickup-time-types} all return 42P01 "relation does not exist" in PROD. The handler is
-- correct (from-migrations e2e returns 200) — these tables were created by 0062's FOREACH helper, which
-- never took effect on prod for the dispatch catalogs (the domain-scale 'migrations are not the source of
-- truth for prod schema' drift; ties to verify_no_unledgered_migrations missing_count:136). Re-running 0062
-- is a no-op if prod's ledger marks it applied, so this NEW migration idempotently CREATEs the tables.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY — no-op where the tables already exist
-- (e2e/migrations DBs). Mirrors 0062's canonical company-scoped catalog shape exactly (same columns, RLS
-- company_scope policy, grants). Reference DDL only — no GL/posting.
-- GATED (catalogs.* DDL): build-and-HOLD — Jorge approves + runs on a Neon branch first, then prod.

BEGIN;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['additional_charges', 'load_types', 'detention_reasons', 'pickup_time_types']
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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON catalogs.%I', tbl);
    EXECUTE format(
      'CREATE POLICY company_scope ON catalogs.%I FOR ALL TO ih35_app
       USING (operating_company_id::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (operating_company_id::text = current_setting(''app.operating_company_id'', true))', tbl);
  END LOOP;
END
$$;

COMMIT;
