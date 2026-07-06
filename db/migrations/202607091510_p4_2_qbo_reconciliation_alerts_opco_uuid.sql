-- [HOLD-FOR-JORGE — TIER 1] P4-2 — qbo.reconciliation_alerts: operating_company_id TEXT -> uuid + FK
-- DB-audit P4: 9 tables with a loose TEXT operating_company_id (no FK). This is the MOST URGENT of the
-- 7 still-open (2 of the original 9 — dispatch.border_crossing_events / dispatch.driver_layovers —
-- are already fixed on main via E2-3/E2-2). Design doc: docs/db-audit/P4-text-opco-DESIGN.md §3.2.
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Prod read-only data-audit 2026-07-05 confirmed this table has 0 rows, so
--     the conversion is clean (no data to remap). ***
--
-- WHY MOST URGENT: the column is declared
--   operating_company_id TEXT NOT NULL DEFAULT 'default'
-- (migration 202606080212). 'default' is not a well-formed uuid, so any row that ever received the
-- literal default could never match a real operating_company_id under RLS — silently orphaned. The
-- data-audit found 0 rows, so nothing is orphaned today; this migration drops the bad default so the
-- class of bug cannot recur, then converts the type + adds the FK. No new default is added (every
-- write path supplies operating_company_id explicitly; a silent uuid default would re-hide the bug).
--
-- Idempotent: DROP DEFAULT / type change are no-ops once applied; policy DROP IF EXISTS + CREATE; FK
-- guarded by pg_constraint. Safe to re-run.
BEGIN;

DO $$
DECLARE
  v_type text;
  v_bad  bigint;
  v_rows bigint;
BEGIN
  IF to_regclass('qbo.reconciliation_alerts') IS NULL THEN
    RAISE NOTICE 'P4-2: qbo.reconciliation_alerts absent — nothing to harden';
    RETURN;
  END IF;

  SELECT count(*) INTO v_rows FROM qbo.reconciliation_alerts;
  RAISE NOTICE 'P4-2: qbo.reconciliation_alerts has % row(s) at apply time (prod audit 2026-07-05: 0)', v_rows;

  -- ── 0. Drop the opco policy BEFORE the ALTER COLUMN (see P4-1 for the Postgres restriction). ────
  DROP POLICY IF EXISTS rls_qbo_recon_alerts ON qbo.reconciliation_alerts;

  -- ── 1. Drop the bad literal default BEFORE converting the type — 'default'::uuid would throw. ────
  ALTER TABLE qbo.reconciliation_alerts ALTER COLUMN operating_company_id DROP DEFAULT;

  -- ── 2. Guarded TEXT -> uuid conversion ─────────────────────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'qbo' AND table_name = 'reconciliation_alerts' AND column_name = 'operating_company_id';

  IF v_type = 'text' THEN
    SELECT count(*) INTO v_bad
    FROM qbo.reconciliation_alerts
    WHERE operating_company_id IS NOT NULL
      AND operating_company_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    IF v_bad > 0 THEN
      RAISE EXCEPTION 'P4-2: % non-uuid operating_company_id row(s) in qbo.reconciliation_alerts (likely the literal ''default'') — prod data-audit (2026-07-05) reported 0 rows; STOP and remap by org.companies.code (never hardcode) before converting.', v_bad;
    END IF;

    ALTER TABLE qbo.reconciliation_alerts
      ALTER COLUMN operating_company_id TYPE uuid
      USING NULLIF(operating_company_id, '')::uuid;
    RAISE NOTICE 'P4-2: operating_company_id converted TEXT -> uuid';
  END IF;

  -- ── 3. Recreate the RLS policy cast-safe ───────────────────────────────────────────────────────
  DROP POLICY IF EXISTS rls_qbo_recon_alerts ON qbo.reconciliation_alerts;
  CREATE POLICY rls_qbo_recon_alerts ON qbo.reconciliation_alerts
    FOR ALL TO ih35_app
    USING (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    WITH CHECK (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      OR current_setting('app.bypass_rls', true) = 'lucia'
    );

  -- ── 4. Missing FOREIGN KEY (plain — table empty/clean) ─────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'qbo' AND table_name = 'reconciliation_alerts' AND column_name = 'operating_company_id';

  IF v_type = 'uuid'
     AND to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_qbo_recon_alerts_company'
         AND conrelid = 'qbo.reconciliation_alerts'::regclass
     ) THEN
    ALTER TABLE qbo.reconciliation_alerts
      ADD CONSTRAINT fk_qbo_recon_alerts_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END
$$;

-- ── 5. Re-assert tenant guardrails + grants (0065 pattern), idempotent ────────────────────────────
ALTER TABLE qbo.reconciliation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qbo.reconciliation_alerts FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA qbo TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON qbo.reconciliation_alerts TO ih35_app;

COMMIT;
