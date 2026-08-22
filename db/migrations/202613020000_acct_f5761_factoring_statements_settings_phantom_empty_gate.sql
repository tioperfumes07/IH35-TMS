-- ACCT-F5761 — views.factoring_statements_settings was permanently pinned to a WHERE-false empty
-- placeholder branch: its creating migrations (0052/0124) wrap the real view body in
-- "IF <retired-table existence check> THEN <real branch> ELSE <empty no-rows fallback>", and the
-- retired table (accounting schema, "factoring_companies") does not exist on prod (existence check
-- confirmed false, live) — so the empty fallback is what's actually live (confirmed via
-- pg_get_viewdef: a literal always-false-filtered NULL-column shape), even though BOTH of this view's real
-- dependencies now carry live data: views.factoring_summary (rebuilt unconditionally under
-- FACT-PHANTOM-01/FACT-01, migration 202609100100, real per-factor rollup) and
-- views.factoring_chargebacks_fees (repointed onto real columns under ACCT-F5760, migration
-- 202613010000, real fee/statement data). This is NOT a dead-JSONB-key bug — it's a stale
-- existence-gate against a retired table blocking an otherwise-working view.
--
-- FIX: rebuild views.factoring_statements_settings unconditionally, dropping the
-- accounting.factoring_companies gate entirely (matching how FACT-PHANTOM-01 already handled the
-- sibling factoring_summary view — an unconditional CREATE OR REPLACE VIEW). Guarded instead on its own
-- two real dependency views existing, which they always do in this codebase given migration ordering.
-- Body is otherwise UNCHANGED from the real branch already written in 0124_p6_active_drift_reconciliation.sql
-- — no new aggregation logic, no GL math, no data mutated.

BEGIN;

DO $$
BEGIN
  IF to_regclass('views.factoring_summary') IS NULL
     OR to_regclass('views.factoring_chargebacks_fees') IS NULL THEN
    RAISE NOTICE 'ACCT-F5761: a dependency view is absent — skip statements/settings view repoint';
    RETURN;
  END IF;

  EXECUTE $STMT$
    CREATE OR REPLACE VIEW views.factoring_statements_settings
    WITH (security_invoker = true) AS
    WITH active_factor AS (
      SELECT
        fs.operating_company_id,
        fs.active_factor_id,
        fs.active_factor_name,
        fs.recourse_days,
        fs.active_factor_count,
        fs.single_factor_invariant_ok
      FROM views.factoring_summary fs
    ),
    statement_rollup AS (
      SELECT
        fcf.operating_company_id,
        date_trunc('month', fcf.created_at)::date AS statement_month,
        SUM(fcf.chargeback_amount)::numeric AS month_chargebacks_total,
        SUM(fcf.factor_fee_amount)::numeric AS month_factor_fees_total
      FROM views.factoring_chargebacks_fees fcf
      GROUP BY fcf.operating_company_id, date_trunc('month', fcf.created_at)
    )
    SELECT
      af.operating_company_id,
      af.active_factor_id,
      af.active_factor_name,
      af.recourse_days,
      af.active_factor_count,
      af.single_factor_invariant_ok,
      sr.statement_month,
      COALESCE(sr.month_chargebacks_total, 0)::numeric AS month_chargebacks_total,
      COALESCE(sr.month_factor_fees_total, 0)::numeric AS month_factor_fees_total
    FROM active_factor af
    LEFT JOIN statement_rollup sr ON sr.operating_company_id = af.operating_company_id
    ORDER BY af.active_factor_name, sr.statement_month DESC NULLS LAST
  $STMT$;

  GRANT SELECT ON views.factoring_statements_settings TO ih35_app;
END
$$;

COMMIT;
