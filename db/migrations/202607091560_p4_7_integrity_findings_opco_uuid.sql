-- [HOLD-FOR-JORGE — TIER 1] P4-7 — safety.integrity_findings: operating_company_id TEXT -> uuid + FK
-- DB-audit P4 (1 of 7 open, last). Design doc §3.6. Table was later extended (GAP-52, 202606080213)
-- but only its anomaly_class CHECK — operating_company_id was never touched; single opco policy.
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Prod read-only data-audit 2026-07-05 confirmed 0 rows — clean conversion. ***
--
-- Same uniform castability-guarded pattern as P4-1. Idempotent + safe to re-run.
BEGIN;

DO $$
DECLARE
  v_type text;
  v_bad  bigint;
  v_rows bigint;
BEGIN
  IF to_regclass('safety.integrity_findings') IS NULL THEN
    RAISE NOTICE 'P4-7: safety.integrity_findings absent — nothing to harden';
    RETURN;
  END IF;

  SELECT count(*) INTO v_rows FROM safety.integrity_findings;
  RAISE NOTICE 'P4-7: safety.integrity_findings has % row(s) at apply time (prod audit 2026-07-05: 0)', v_rows;

  -- ── 0. Drop the opco policy BEFORE the ALTER COLUMN ────────────────────────────────────────────
  DROP POLICY IF EXISTS rls_safety_integrity_findings_company ON safety.integrity_findings;

  -- ── 1. Guarded TEXT -> uuid conversion ─────────────────────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'safety' AND table_name = 'integrity_findings' AND column_name = 'operating_company_id';

  IF v_type = 'text' THEN
    SELECT count(*) INTO v_bad
    FROM safety.integrity_findings
    WHERE operating_company_id IS NOT NULL
      AND operating_company_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    IF v_bad > 0 THEN
      RAISE EXCEPTION 'P4-7: % non-uuid operating_company_id row(s) in safety.integrity_findings — prod data-audit (2026-07-05) reported 0 rows; STOP and remap by org.companies.code before converting.', v_bad;
    END IF;

    ALTER TABLE safety.integrity_findings
      ALTER COLUMN operating_company_id TYPE uuid
      USING NULLIF(operating_company_id, '')::uuid;
    RAISE NOTICE 'P4-7: operating_company_id converted TEXT -> uuid';
  END IF;

  -- ── 2. Recreate the RLS policy cast-safe ───────────────────────────────────────────────────────
  DROP POLICY IF EXISTS rls_safety_integrity_findings_company ON safety.integrity_findings;
  CREATE POLICY rls_safety_integrity_findings_company ON safety.integrity_findings
    FOR ALL TO ih35_app
    USING (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      OR current_setting('app.bypass_rls', true) = 'lucia'
    )
    WITH CHECK (
      operating_company_id::text = current_setting('app.operating_company_id', true)
      OR current_setting('app.bypass_rls', true) = 'lucia'
    );

  -- ── 3. Missing FOREIGN KEY (plain — table empty/clean) ─────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'safety' AND table_name = 'integrity_findings' AND column_name = 'operating_company_id';

  IF v_type = 'uuid'
     AND to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_integrity_findings_company'
         AND conrelid = 'safety.integrity_findings'::regclass
     ) THEN
    ALTER TABLE safety.integrity_findings
      ADD CONSTRAINT fk_integrity_findings_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END
$$;

-- ── 4. Re-assert tenant guardrails + grants (0065 pattern), idempotent ────────────────────────────
ALTER TABLE safety.integrity_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.integrity_findings FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.integrity_findings TO ih35_app;

COMMIT;
