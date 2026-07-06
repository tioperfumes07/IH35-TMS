-- [HOLD-FOR-JORGE — TIER 1] P4-3 — accounting.recurring_bill_templates: operating_company_id TEXT -> uuid + FK
-- DB-audit P4 (1 of 7 open). FINANCIAL-CLUSTER table (accounting.*). Design doc §3.3.
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Prod read-only data-audit 2026-07-05 confirmed 0 rows — clean conversion. ***
--
-- Same uniform pattern as P4-1 (castability-guarded conversion). NOTE: the child table
-- accounting.recurring_bill_generation_log does NOT carry operating_company_id, but its RLS policy
-- (rbgl_tenant_scope) SUBQUERIES recurring_bill_templates.operating_company_id — so it references the
-- column being altered and must also be dropped before the ALTER and recreated cast-safe after.
-- FORCE RLS on both tables was already asserted by 202606281050_force_rls_financial_tables.sql.
--
-- Idempotent + safe to re-run.
BEGIN;

DO $$
DECLARE
  v_type text;
  v_bad  bigint;
  v_rows bigint;
BEGIN
  IF to_regclass('accounting.recurring_bill_templates') IS NULL THEN
    RAISE NOTICE 'P4-3: accounting.recurring_bill_templates absent — nothing to harden';
    RETURN;
  END IF;

  SELECT count(*) INTO v_rows FROM accounting.recurring_bill_templates;
  RAISE NOTICE 'P4-3: accounting.recurring_bill_templates has % row(s) at apply time (prod audit 2026-07-05: 0)', v_rows;

  -- ── 0. Drop BOTH policies that reference operating_company_id (parent direct + child via subquery) ──
  DROP POLICY IF EXISTS rbt_tenant_scope ON accounting.recurring_bill_templates;
  IF to_regclass('accounting.recurring_bill_generation_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS rbgl_tenant_scope ON accounting.recurring_bill_generation_log;
  END IF;

  -- ── 1. Guarded TEXT -> uuid conversion ─────────────────────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'accounting' AND table_name = 'recurring_bill_templates' AND column_name = 'operating_company_id';

  IF v_type = 'text' THEN
    SELECT count(*) INTO v_bad
    FROM accounting.recurring_bill_templates
    WHERE operating_company_id IS NOT NULL
      AND operating_company_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    IF v_bad > 0 THEN
      RAISE EXCEPTION 'P4-3: % non-uuid operating_company_id row(s) in accounting.recurring_bill_templates — prod data-audit (2026-07-05) reported 0 rows; STOP and remap by org.companies.code before converting.', v_bad;
    END IF;

    ALTER TABLE accounting.recurring_bill_templates
      ALTER COLUMN operating_company_id TYPE uuid
      USING NULLIF(operating_company_id, '')::uuid;
    RAISE NOTICE 'P4-3: operating_company_id converted TEXT -> uuid';
  END IF;

  -- ── 2. Recreate BOTH policies cast-safe ────────────────────────────────────────────────────────
  DROP POLICY IF EXISTS rbt_tenant_scope ON accounting.recurring_bill_templates;
  CREATE POLICY rbt_tenant_scope ON accounting.recurring_bill_templates
    FOR ALL TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );

  IF to_regclass('accounting.recurring_bill_generation_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS rbgl_tenant_scope ON accounting.recurring_bill_generation_log;
    CREATE POLICY rbgl_tenant_scope ON accounting.recurring_bill_generation_log
      FOR ALL TO ih35_app
      USING (
        identity.is_lucia_bypass()
        OR template_uuid IN (
          SELECT uuid FROM accounting.recurring_bill_templates
          WHERE operating_company_id::text = current_setting('app.operating_company_id', true)
        )
      );
  END IF;

  -- ── 3. Missing FOREIGN KEY (plain — table empty/clean) ─────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'accounting' AND table_name = 'recurring_bill_templates' AND column_name = 'operating_company_id';

  IF v_type = 'uuid'
     AND to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_recurring_bill_templates_company'
         AND conrelid = 'accounting.recurring_bill_templates'::regclass
     ) THEN
    ALTER TABLE accounting.recurring_bill_templates
      ADD CONSTRAINT fk_recurring_bill_templates_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END
$$;

-- ── 4. Re-assert tenant guardrails + grants (0065 pattern), idempotent ────────────────────────────
ALTER TABLE accounting.recurring_bill_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.recurring_bill_templates FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA accounting TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.recurring_bill_templates TO ih35_app;

COMMIT;
