-- 202606241800 — Reconcile prod catalog-schema drift (evidence-driven, idempotent).
--
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- WHY (proven, not assumed):
--   Read-only audits against PROD (br-fancy-credit-akjnd07a, 2026-06-24, API-verified endpoint) showed
--   prod's live schema is NOT the migration set — 0062's catalog FOREACH never took effect on prod for
--   most catalog tables. Diffing every CREATE TABLE / ADD COLUMN target across the 24 checksum-drifted
--   migrations' CURRENT SQL against prod information_schema found EXACTLY:
--     • 24 MISSING catalogs.* generic reference tables (the 0062 FOREACH set, minus the 9 already present
--       — additional_charges/load_types/detention_reasons/pickup_time_types were created by #1460, and
--       driver_pay_types/driver_deduction_types/escrow_types/fuel_grades/pay_rate_templates pre-existed).
--     • 2 MISSING columns on safety.company_violations (severity, evidence_doc_ids) — added to 0050 in a
--       post-apply edit that never re-ran on prod.
--   NOTHING else was missing: all accounting.*/banking.* tables, GL/posting/recompute triggers, COA role
--   bindings, the driver_bills backfill, and the catalogs.accounts seed are ALL already present on prod.
--   So this reconcile is PURE ADDITIVE reference-catalog DDL — it does NOT re-install or touch any
--   financial posting logic (deliberately scoped that way after the per-file safety audit).
--
-- WHAT this does:
--   1. Re-asserts 0062's FULL canonical catalog-table set (all 33 names) with CREATE TABLE IF NOT EXISTS
--      + index + RLS + GRANT + company_scope policy — identical shape to 0062/#1460. IF NOT EXISTS makes
--      the 9 already-present tables a no-op; creates the 24 missing ones (incl. civil_fine_types,
--      lumper_providers [unblocks wizard W-5/W-6], mx_customs_brokers, etc.). Using the FULL array (not
--      just the 24) is the faithful "re-apply 0062's current catalog SQL idempotently" and self-heals if
--      the live read missed one.
--   2. Adds the 2 missing safety.company_violations columns (to_regclass-guarded, ADD COLUMN IF NOT EXISTS).
--
-- WHAT this deliberately does NOT do (see the design doc):
--   • Does NOT mutate the migration ledger to clean the 4 benign 0408_* ghost rows (their timestamp-renamed
--     twins are applied; objects exist; mutating _system._schema_migrations risks the immutability guard).
--     Optional guarded cleanup SQL is in docs/specs/incidents/RECONCILE-prod-catalog-schema-drift.md.
--   • Does NOT re-run any accounting.*/banking.* DDL, GL triggers, or seeds — none were missing.
--
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY + ADD COLUMN IF NOT EXISTS. Pure no-op
--   on the e2e/migrations DBs (everything exists) and re-runnable on prod.
--
-- GATED (catalogs.* schema = §1.4 financial cluster) → [HOLD-FOR-JORGE]: build + branch-test by the coder;
--   Jorge approves and applies on a Neon branch first, then PROD — endpoint verified via Neon API before
--   apply (per the 2026-06-24 prod-write incident control). NEVER self-merge.

BEGIN;

-- 1) Canonical 0062 generic catalog tables (full set; IF NOT EXISTS → no-op where present). ──────────────
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'accident_types', 'additional_charges', 'air_bag_catalog', 'battery_catalog', 'cash_advance_types',
    'civil_fine_types', 'def_stations', 'detention_reasons', 'driver_deduction_types', 'driver_pay_types',
    'escrow_types', 'expensive_states', 'fuel_grades', 'fuel_stations', 'ifta_states', 'leave_types',
    'load_trailer_equipment', 'load_types', 'lumper_providers', 'mx_customs_brokers', 'pay_rate_templates',
    'pickup_time_types', 'pm_intervals', 'qbo_categories', 'relay_accounts', 'repair_locations',
    'settlement_templates', 'tire_catalog', 'toll_providers', 'trailer_parts', 'truck_parts',
    'work_order_templates', 'workplace_incident_types'
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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON catalogs.%I TO ih35_app', tbl);
    EXECUTE format('DROP POLICY IF EXISTS company_scope ON catalogs.%I', tbl);
    EXECUTE format(
      'CREATE POLICY company_scope ON catalogs.%I FOR ALL TO ih35_app
       USING (operating_company_id::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (operating_company_id::text = current_setting(''app.operating_company_id'', true))', tbl);
  END LOOP;
END
$$;

-- 2) safety.company_violations — 2 columns added to 0050 post-apply, missing on prod. ────────────────────
DO $$
BEGIN
  IF to_regclass('safety.company_violations') IS NOT NULL THEN
    ALTER TABLE safety.company_violations
      ADD COLUMN IF NOT EXISTS severity smallint CHECK (severity BETWEEN 1 AND 10),
      ADD COLUMN IF NOT EXISTS evidence_doc_ids uuid[];
  END IF;
END
$$;

COMMIT;
