-- [HOLD-FOR-JORGE — TIER 1] P4-4 — reports.scheduled_subscriptions: operating_company_id TEXT -> uuid + FK
-- DB-audit P4 (1 of 7 open). Design doc §3.4.
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Prod read-only data-audit 2026-07-05 confirmed 0 rows — clean conversion. ***
--
-- IMPORTANT: unlike the other 6 P4 tables, reports.scheduled_subscriptions is SEEDED by its own
-- creation migration (202606080206 inserts per-company subscription rows using c.id::text). So on a
-- fresh CI DB this table is NOT empty — it holds valid-uuid seed rows. That is exactly why the P4
-- guard checks CASTABILITY (are all values uuid-shaped?) rather than raw emptiness: a raw
-- "RAISE if non-empty" guard would false-fail CI here. Prod is confirmed empty; CI is seeded-but-clean;
-- both convert cleanly. The child table reports.scheduled_delivery_log has no operating_company_id but
-- its policy subqueries the parent's, so it is dropped/recreated cast-safe too.
--
-- Idempotent + safe to re-run.
BEGIN;

DO $$
DECLARE
  v_type text;
  v_bad  bigint;
  v_rows bigint;
BEGIN
  IF to_regclass('reports.scheduled_subscriptions') IS NULL THEN
    RAISE NOTICE 'P4-4: reports.scheduled_subscriptions absent — nothing to harden';
    RETURN;
  END IF;

  SELECT count(*) INTO v_rows FROM reports.scheduled_subscriptions;
  RAISE NOTICE 'P4-4: reports.scheduled_subscriptions has % row(s) at apply time (prod audit 2026-07-05: 0; CI: seed rows present, all valid uuid)', v_rows;

  -- ── 0. Drop BOTH policies (parent direct + child log via subquery) BEFORE the ALTER ────────────
  DROP POLICY IF EXISTS scheduled_subs_tenant_scope ON reports.scheduled_subscriptions;
  IF to_regclass('reports.scheduled_delivery_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS scheduled_delivery_log_tenant_scope ON reports.scheduled_delivery_log;
  END IF;

  -- ── 1. Guarded TEXT -> uuid conversion ─────────────────────────────────────────────────────────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'reports' AND table_name = 'scheduled_subscriptions' AND column_name = 'operating_company_id';

  IF v_type = 'text' THEN
    SELECT count(*) INTO v_bad
    FROM reports.scheduled_subscriptions
    WHERE operating_company_id IS NOT NULL
      AND operating_company_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    IF v_bad > 0 THEN
      RAISE EXCEPTION 'P4-4: % non-uuid operating_company_id row(s) in reports.scheduled_subscriptions — prod data-audit (2026-07-05) reported 0 rows and the seed uses c.id::text (valid uuids); STOP and remap by org.companies.code before converting.', v_bad;
    END IF;

    ALTER TABLE reports.scheduled_subscriptions
      ALTER COLUMN operating_company_id TYPE uuid
      USING NULLIF(operating_company_id, '')::uuid;
    RAISE NOTICE 'P4-4: operating_company_id converted TEXT -> uuid';
  END IF;

  -- ── 2. Recreate BOTH policies cast-safe ────────────────────────────────────────────────────────
  DROP POLICY IF EXISTS scheduled_subs_tenant_scope ON reports.scheduled_subscriptions;
  CREATE POLICY scheduled_subs_tenant_scope ON reports.scheduled_subscriptions
    FOR ALL TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );

  IF to_regclass('reports.scheduled_delivery_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS scheduled_delivery_log_tenant_scope ON reports.scheduled_delivery_log;
    CREATE POLICY scheduled_delivery_log_tenant_scope ON reports.scheduled_delivery_log
      FOR ALL TO ih35_app
      USING (
        identity.is_lucia_bypass()
        OR subscription_uuid IN (
          SELECT uuid FROM reports.scheduled_subscriptions
          WHERE operating_company_id::text = current_setting('app.operating_company_id', true)
        )
      )
      WITH CHECK (
        identity.is_lucia_bypass()
        OR subscription_uuid IN (
          SELECT uuid FROM reports.scheduled_subscriptions
          WHERE operating_company_id::text = current_setting('app.operating_company_id', true)
        )
      );
  END IF;

  -- ── 3. Missing FOREIGN KEY (plain — seed rows reference real org.companies, validates fine) ─────
  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'reports' AND table_name = 'scheduled_subscriptions' AND column_name = 'operating_company_id';

  IF v_type = 'uuid'
     AND to_regclass('org.companies') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'fk_scheduled_subscriptions_company'
         AND conrelid = 'reports.scheduled_subscriptions'::regclass
     ) THEN
    ALTER TABLE reports.scheduled_subscriptions
      ADD CONSTRAINT fk_scheduled_subscriptions_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END
$$;

-- ── 4. Re-assert tenant guardrails + grants (0065 pattern), idempotent ────────────────────────────
ALTER TABLE reports.scheduled_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports.scheduled_subscriptions FORCE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA reports TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON reports.scheduled_subscriptions TO ih35_app;

COMMIT;
