-- [HOLD-FOR-JORGE — TIER 1] P4-1 — dispatch.stop_extra_rates: operating_company_id TEXT -> uuid + FK
-- DB-audit P4: 9 tables with a loose TEXT operating_company_id (no FK). This is 1 of 7 still-open
-- (2 of the original 9 — dispatch.border_crossing_events / dispatch.driver_layovers — are already
-- fixed on main via E2-3/E2-2). Design doc: docs/db-audit/P4-text-opco-DESIGN.md §3.1.
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Prod read-only data-audit 2026-07-05 confirmed this table has 0 rows, so
--     the conversion is clean (no data to remap). ***
--
-- PATTERN (uniform across all 7 P4 migrations): drop opco policy -> guarded TEXT->uuid conversion
-- (RAISE EXCEPTION if any non-uuid value is present, since the data-audit proved the table clean; the
-- guard is a tripwire against data appearing between audit and apply) -> recreate cast-safe FORCE-RLS
-- policy -> add FK -> re-assert grants. The guard checks CASTABILITY, not raw emptiness, so it stays
-- green on a fresh CI DB (empty here) AND on any table seeded with valid-uuid rows by its own creation
-- migration; it fires only on genuinely non-uuid data.
--
-- Idempotent: type change is a no-op once already uuid; policy is DROP IF EXISTS + CREATE; FK is
-- guarded by pg_constraint existence; GRANT/FORCE re-runnable. Safe to re-run.
BEGIN;

DO $$
DECLARE
  v_type text;
  v_bad  bigint;
  v_rows bigint;
BEGIN
  IF to_regclass('dispatch.stop_extra_rates') IS NULL THEN
    RAISE NOTICE 'P4-1: dispatch.stop_extra_rates absent — nothing to harden';
    RETURN;
  END IF;

  SELECT count(*) INTO v_rows FROM dispatch.stop_extra_rates;
  RAISE NOTICE 'P4-1: dispatch.stop_extra_rates has % row(s) at apply time (prod audit 2026-07-05: 0)', v_rows;

  -- ── 0. Drop the opco policy BEFORE the ALTER COLUMN. Postgres refuses "ALTER COLUMN ... TYPE"
  --      while a policy references the column ("cannot alter type of a column used in a policy
  --      definition"). Recreated in step 2 cast-safe. Idempotent.
  DROP POLICY IF EXISTS stop_extra_rates_tenant_isolation ON dispatch.stop_extra_rates;

  -- ── 1. Guarded TEXT -> uuid conversion ─────────────────────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'dispatch' AND table_name = 'stop_extra_rates' AND column_name = 'operating_company_id';

  IF v_type = 'text' THEN
    SELECT count(*) INTO v_bad
    FROM dispatch.stop_extra_rates
    WHERE operating_company_id IS NOT NULL
      AND operating_company_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    IF v_bad > 0 THEN
      RAISE EXCEPTION 'P4-1: % non-uuid operating_company_id row(s) in dispatch.stop_extra_rates — prod data-audit (2026-07-05) reported this table clean/empty; STOP and remap by org.companies.code (never hardcode) before converting.', v_bad;
    END IF;

    ALTER TABLE dispatch.stop_extra_rates
      ALTER COLUMN operating_company_id TYPE uuid
      USING NULLIF(operating_company_id, '')::uuid;
    RAISE NOTICE 'P4-1: operating_company_id converted TEXT -> uuid';
  END IF;

  -- ── 2. Recreate the RLS policy cast-safe (works whether or not the ALTER ran) ───────────────────
  DROP POLICY IF EXISTS stop_extra_rates_tenant_isolation ON dispatch.stop_extra_rates;
  CREATE POLICY stop_extra_rates_tenant_isolation ON dispatch.stop_extra_rates
    FOR ALL TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );

  -- ── 3. Missing FOREIGN KEY (plain — table is empty/clean so it validates instantly) ─────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'dispatch' AND table_name = 'stop_extra_rates' AND column_name = 'operating_company_id';

  IF v_type = 'uuid'
     AND to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_stop_extra_rates_company'
         AND conrelid = 'dispatch.stop_extra_rates'::regclass
     ) THEN
    ALTER TABLE dispatch.stop_extra_rates
      ADD CONSTRAINT fk_stop_extra_rates_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END
$$;

-- ── 4. Re-assert tenant guardrails + grants (0065 pattern), idempotent ────────────────────────────
ALTER TABLE dispatch.stop_extra_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.stop_extra_rates FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.stop_extra_rates TO ih35_app;

COMMIT;
