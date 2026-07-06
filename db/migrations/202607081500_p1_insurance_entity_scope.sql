-- [HOLD-FOR-JORGE — TIER 1] P1 DB-Audit — insurance.* entity scope (7 business tables).
-- Companion: docs/db-audit/P1-insurance-factoring-entity-scope-DESIGN.md (read this first).
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill
--     so prod db:migrate skips it. This migration POSTS NOTHING and touches no accounting/GL table — it
--     is entity-scoping/RLS schema work, still financial-cluster per CLAUDE.md §1.4 (schema + RLS + FK). ***
--
-- WHY THIS FILE LOOKS THE WAY IT DOES (read before editing):
-- Two independent, CONTRADICTING reads of these 7 tables exist and are not yet reconciled:
--   (a) db/migrations/0274_insurance.sql, 0285_insurance_claims_lawsuits.sql,
--       202606072350_insurance_policy_cancellation.sql, 0283_insurance_coi.sql,
--       0284_insurance_payment_schedule.sql (as committed today) show `tenant_id uuid NOT NULL
--       REFERENCES org.companies(id)` + FORCE RLS + a tenant-scoped policy on ALL 7 tables, since each
--       table's origin migration.
--   (b) A 2026-07 read-only PROD inspection (coordinator-relayed) reports these 7 tables have NO
--       entity-scoping column at all in the live database, 0 rows each, RLS force-enabled but with no
--       column to scope on (a false sense of security — FORCE RLS with an all-or-nothing/no-op policy
--       does not separate entities).
-- These cannot both be true of the SAME live table today. Rather than guess which one is current truth
-- (forbidden — CLAUDE.md hardline: never guess/assume), this migration is written to be CORRECT UNDER
-- EITHER reality: it detects whichever column (if any) already exists and adapts, so it is safe to run
-- regardless of which report is accurate, and a no-op on any column it finds already correctly wired.
-- Before running on a Neon branch: FIRST run (read-only, cheap, resolves the contradiction definitively)
--   SELECT table_name, column_name FROM information_schema.columns
--     WHERE table_schema = 'insurance' AND column_name IN ('tenant_id','operating_company_id')
--     ORDER BY table_name;
--   SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'insurance' ORDER BY tablename;
--
-- SCOPE: policy, policy_unit, claim, coi_request, lawsuit, payment_schedule, refund_obligation.
-- insurance.type_catalog is DELIBERATELY EXCLUDED — coordinator-relayed prod read: 45 rows, matching
-- the (15 codes × N active companies) seed pattern in 0275_insurance_type_catalog.sql — this is GLOBAL
-- reference/allowlist data (insurance coverage-type definitions), not per-transaction data, and there is
-- no evidence a coverage-type code is entity-specific. Do not scope it without Jorge's explicit call.
--
-- EMPTY-TABLE FAST PATH: if a table genuinely has 0 rows and no scoping column, `ADD COLUMN ... NOT NULL`
-- with no default is immediately valid (no backfill needed) — but the helper function still guards this
-- with a live emptiness check and RAISEs rather than silently truncating/assuming, in case a surprise row
-- exists by the time this actually runs on a branch.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.p1_ensure_opco_scope(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_col text;
  v_fk_name text := p_table || '_opco_fk';
  v_policy_name text := p_table || '_opco_scope';
BEGIN
  -- 1. Which entity-scope column (if any) already exists on the live table? Prefer
  --    operating_company_id if (implausibly) both exist; otherwise use whichever is present.
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema = p_schema AND table_name = p_table
    AND column_name IN ('operating_company_id', 'tenant_id')
  ORDER BY (column_name = 'operating_company_id') DESC
  LIMIT 1;

  IF v_col IS NULL THEN
    -- Neither column exists: matches the coordinator-relayed prod read. Guard against a surprise
    -- non-empty table (a NOT NULL add with no default cannot be applied to existing rows safely).
    EXECUTE format(
      $g$DO $guard$ BEGIN
        IF EXISTS (SELECT 1 FROM %I.%I LIMIT 1) THEN
          RAISE EXCEPTION 'P1: %I.%I is NON-EMPTY at apply time — the empty-table fast path in this
            migration does not apply. STOP: this needs a real nullable->backfill->NOT NULL migration
            (see docs/db-audit/P1-insurance-factoring-entity-scope-DESIGN.md §4 pattern), not this one.';
        END IF;
      END $guard$;$g$,
      p_schema, p_table, p_schema, p_table
    );
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN operating_company_id uuid', p_schema, p_table);
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN operating_company_id SET NOT NULL', p_schema, p_table);
    v_col := 'operating_company_id';
  ELSE
    -- A scoping column already exists under one of the two names (matches the migration-file read).
    -- Do NOT add a second, duplicate column. Just make sure it's NOT NULL (idempotent no-op if so).
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL', p_schema, p_table, v_col);
  END IF;

  -- 2. FK -> org.companies (idempotent — only add if missing under this exact constraint name).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = p_schema AND t.relname = p_table AND c.conname = v_fk_name
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES org.companies(id)',
      p_schema, p_table, v_fk_name, v_col
    );
  END IF;

  -- 3. FORCE RLS (idempotent regardless of prior state — re-asserting is always safe).
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', p_schema, p_table);

  -- 4. Canonical entity-scoped policy, keyed on whichever column is real. Rebuilt unconditionally so a
  --    stale/permissive/wrong-predicate policy (the "false sense of security" the coordinator flagged)
  --    is replaced, not left in place alongside a new one.
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', v_policy_name, p_schema, p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %I.%I FOR ALL TO ih35_app
       USING (identity.is_lucia_bypass() OR %I::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (identity.is_lucia_bypass() OR %I::text = current_setting(''app.operating_company_id'', true))',
    v_policy_name, p_schema, p_table, v_col, v_col
  );

  -- 5. Grants (defensive re-assert; unchanged shape from the original 0274/0283/0284/0285/
  --    202606072350 grants — DELETE-grant hygiene is a separate, flagged, not-yet-actioned item, see
  --    design doc §5).
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO ih35_app', p_schema, p_table);

  RAISE NOTICE 'P1 insurance: %.% entity-scope column=% ensured (fk=%, policy=%)',
    p_schema, p_table, v_col, v_fk_name, v_policy_name;
END;
$fn$;

GRANT USAGE ON SCHEMA insurance TO ih35_app;

SELECT pg_temp.p1_ensure_opco_scope('insurance', 'policy');
SELECT pg_temp.p1_ensure_opco_scope('insurance', 'policy_unit');
SELECT pg_temp.p1_ensure_opco_scope('insurance', 'claim');
SELECT pg_temp.p1_ensure_opco_scope('insurance', 'coi_request');
SELECT pg_temp.p1_ensure_opco_scope('insurance', 'lawsuit');
SELECT pg_temp.p1_ensure_opco_scope('insurance', 'payment_schedule');
SELECT pg_temp.p1_ensure_opco_scope('insurance', 'refund_obligation');

DROP FUNCTION IF EXISTS pg_temp.p1_ensure_opco_scope(text, text);

COMMIT;

-- BACKEND WRITE-PATH REQUIREMENT (must ship WITH or before this migration, see design doc §1/§9):
-- If the live column turns out to be a FRESH `operating_company_id` (branch (a) above did not hold),
-- every INSERT below currently binds ONLY `tenant_id` and must be updated to also bind
-- `operating_company_id` from the same request-scoped value, or every write from that call site 500s:
--   apps/backend/src/insurance/policy.routes.ts (create/list/get/cancel routes, lines ~114-278)
--   apps/backend/src/insurance/policy-create-atomic.service.ts (lines ~185, 246, 294)
--   apps/backend/src/insurance/coi-request.routes.ts, coi.service.ts
--   apps/backend/src/insurance/claim.routes.ts
--   apps/backend/src/insurance/lawsuit.routes.ts
--   apps/backend/src/insurance/payment-schedule.routes.ts, policy-bill-schedule.service.ts,
--     late-fee.service.ts, payment-reminder.service.ts
--   apps/backend/src/insurance/refund-obligation.service.ts, policy-cancel.service.ts
--   apps/backend/src/insurance/type-catalog.routes.ts (N/A — type_catalog excluded, see header)
--   apps/backend/src/safety/damage-continuity/insurance-link.service.ts (auto-creates insurance.claim)
-- If instead the live column is already `tenant_id` (branch (b) did not hold), NONE of the above need a
-- code change — they already write `tenant_id` correctly. Resolve via the two read-only queries in the
-- header comment before deciding which of these two is the real, non-hypothetical task.

-- DOWN (manual rollback, Neon-branch only):
-- BEGIN;
--   -- Only if this run actually took the "neither column existed" branch for a given table:
--   ALTER TABLE insurance.<table> DROP CONSTRAINT IF EXISTS <table>_opco_fk;
--   ALTER TABLE insurance.<table> DROP COLUMN IF EXISTS operating_company_id;
-- COMMIT;
