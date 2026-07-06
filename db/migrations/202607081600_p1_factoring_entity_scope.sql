-- [HOLD-FOR-JORGE — TIER 1] P1 DB-Audit — factoring.* entity scope (5 tables).
-- Companion: docs/db-audit/P1-insurance-factoring-entity-scope-DESIGN.md (read this first).
-- Sibling migration: 202607081500_p1_insurance_entity_scope.sql (same pattern, insurance schema).
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill
--     so prod db:migrate skips it. This migration POSTS NOTHING and touches no accounting/GL table — it
--     is entity-scoping/RLS schema work, still financial-cluster per CLAUDE.md §1.4 (schema + RLS + FK). ***
--
-- WHY THIS FILE LOOKS THE WAY IT DOES: same unresolved contradiction as the insurance sibling migration.
--   (a) db/migrations/0286-0290 (as committed today) show `tenant_id uuid NOT NULL REFERENCES
--       org.companies(id)` + FORCE RLS + a tenant-scoped policy on ALL 5 tables below, since each
--       table's origin migration — INCLUDING factoring.factor, which the P1 task brief specifically
--       expected to already have the org.companies FK (confirmed true in the design doc §2).
--   (b) A 2026-07 read-only PROD inspection (coordinator-relayed) reports these 5 tables have NO
--       entity-scoping column at all in the live database, 0 rows each, RLS force-enabled with no real
--       column to scope on.
-- Not resolved here — this migration adapts to whichever is true at apply time (see the shared helper
-- function; identical logic to the insurance sibling). Before running on a Neon branch, FIRST run:
--   SELECT table_name, column_name FROM information_schema.columns
--     WHERE table_schema = 'factoring' AND column_name IN ('tenant_id','operating_company_id')
--     ORDER BY table_name;
--   SELECT tablename, policyname, qual FROM pg_policies WHERE schemaname = 'factoring' ORDER BY tablename;
--
-- SCOPE: batch, factor, reserve_movement, customer_factor_assignment, bank_match_suggestion.
-- factoring.v_factor_reserve_balance (a VIEW, not a table) is untouched — it derives its scoping
-- entirely from reserve_movement's RLS-filtered rows and already has security_invoker=true
-- (202606271500_f3_views_security_invoker.sql); once reserve_movement's own scoping is correct, the
-- view inherits it with no separate change needed.
-- The DISTINCT `factor` schema (singular — factor.faro_daily_imports, factor.faro_invoice_lines,
-- factor.reconciliation_runs, factor.reconciliation_items, from 0104/0224) is OUT OF SCOPE here: verified
-- those already carry `operating_company_id uuid NOT NULL REFERENCES org.companies(id)` +
-- entity-scoped FORCE RLS since their own origin migrations (0104_p5_g_g1_faro_daily_imports.sql,
-- 0224_block_26_factor_reconciliation.sql) — no action needed, confirmed both by the migration files and
-- the coordinator-relayed prod read (both agree on this one).

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
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema = p_schema AND table_name = p_table
    AND column_name IN ('operating_company_id', 'tenant_id')
  ORDER BY (column_name = 'operating_company_id') DESC
  LIMIT 1;

  IF v_col IS NULL THEN
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
    EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL', p_schema, p_table, v_col);
  END IF;

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

  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_schema, p_table);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', p_schema, p_table);

  EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', v_policy_name, p_schema, p_table);
  EXECUTE format(
    'CREATE POLICY %I ON %I.%I FOR ALL TO ih35_app
       USING (identity.is_lucia_bypass() OR %I::text = current_setting(''app.operating_company_id'', true))
       WITH CHECK (identity.is_lucia_bypass() OR %I::text = current_setting(''app.operating_company_id'', true))',
    v_policy_name, p_schema, p_table, v_col, v_col
  );

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.%I TO ih35_app', p_schema, p_table);

  RAISE NOTICE 'P1 factoring: %.% entity-scope column=% ensured (fk=%, policy=%)',
    p_schema, p_table, v_col, v_fk_name, v_policy_name;
END;
$fn$;

GRANT USAGE ON SCHEMA factoring TO ih35_app;

SELECT pg_temp.p1_ensure_opco_scope('factoring', 'batch');
SELECT pg_temp.p1_ensure_opco_scope('factoring', 'factor');
SELECT pg_temp.p1_ensure_opco_scope('factoring', 'reserve_movement');
SELECT pg_temp.p1_ensure_opco_scope('factoring', 'customer_factor_assignment');
SELECT pg_temp.p1_ensure_opco_scope('factoring', 'bank_match_suggestion');

DROP FUNCTION IF EXISTS pg_temp.p1_ensure_opco_scope(text, text);

COMMIT;

-- BACKEND WRITE-PATH REQUIREMENT (must ship WITH or before this migration, see design doc §2/§9):
-- If the live column turns out to be a FRESH `operating_company_id` (branch (a) above did not hold),
-- every INSERT below currently binds ONLY `tenant_id` and must be updated to also bind
-- `operating_company_id` from the same request-scoped value, or every write from that call site 500s:
--   apps/backend/src/factoring/batch.service.ts (INSERT INTO factoring.batch, line ~190)
--   apps/backend/src/factoring/factor.service.ts (factor + customer_factor_assignment inserts)
--   apps/backend/src/factoring/factor.routes.ts (every route wrapped in withCompanyScope(user.uuid,
--     body.data.operating_company_id, ...) — the GUC is already set correctly per-request; only the
--     column bound in the INSERT list would need to change)
--   apps/backend/src/factoring/reserve.service.ts (reserve_movement inserts)
--   apps/backend/src/factoring/bank-match.service.ts (bank_match_suggestion inserts)
-- If instead the live column is already `tenant_id` (branch (b) did not hold), NONE of the above need a
-- code change. Resolve via the two read-only queries in the header comment first.

-- DOWN (manual rollback, Neon-branch only):
-- BEGIN;
--   ALTER TABLE factoring.<table> DROP CONSTRAINT IF EXISTS <table>_opco_fk;
--   ALTER TABLE factoring.<table> DROP COLUMN IF EXISTS operating_company_id;
-- COMMIT;
