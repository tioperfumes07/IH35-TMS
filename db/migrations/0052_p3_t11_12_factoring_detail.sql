BEGIN;

CREATE SCHEMA IF NOT EXISTS views;

DROP VIEW IF EXISTS views.factoring_statements_settings;
DROP VIEW IF EXISTS views.factoring_chargebacks_fees;
DROP VIEW IF EXISTS views.factoring_recourse_at_risk;
DROP VIEW IF EXISTS views.factoring_summary;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_companies') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.factoring_summary
      WITH (security_invoker = true) AS
      WITH company_base AS (
        SELECT
          fc.operating_company_id,
          fc.id AS factoring_company_id,
          COALESCE(fc.display_name, 'Faro Factoring')::text AS factoring_company_name,
          fc.active,
          COALESCE(fc.current_reserve_balance, 0)::numeric AS current_reserve_balance,
          COALESCE(fc.current_chargeback_balance, 0)::numeric AS current_chargeback_balance,
          fc.last_advance_at,
          COALESCE(NULLIF(to_jsonb(fc)->>'recourse_days', '')::int, 90) AS recourse_days
        FROM accounting.factoring_companies fc
      ),
      active_counts AS (
        SELECT
          operating_company_id,
          COUNT(*) FILTER (WHERE active = true)::int AS active_factor_count
        FROM company_base
        GROUP BY operating_company_id
      ),
      mtd_advances AS (
        SELECT
          fa.operating_company_id,
          COUNT(*)::int AS mtd_advances_count,
          SUM(COALESCE(NULLIF(to_jsonb(fa)->>'advance_amount', '')::numeric, 0))::numeric AS mtd_advanced_total
        FROM accounting.factoring_advances fa
        WHERE fa.created_at >= date_trunc('month', now())
        GROUP BY fa.operating_company_id
      )
      SELECT
        cb.operating_company_id,
        cb.factoring_company_id AS active_factor_id,
        cb.factoring_company_name AS active_factor_name,
        cb.recourse_days,
        cb.current_reserve_balance AS reserve_balance,
        cb.current_chargeback_balance AS chargeback_balance,
        cb.last_advance_at,
        ac.active_factor_count,
        (ac.active_factor_count <= 1) AS single_factor_invariant_ok,
        COALESCE(ma.mtd_advances_count, 0)::int AS mtd_advances_count,
        COALESCE(ma.mtd_advanced_total, 0)::numeric AS mtd_advanced_total
      FROM company_base cb
      LEFT JOIN active_counts ac ON ac.operating_company_id = cb.operating_company_id
      LEFT JOIN mtd_advances ma ON ma.operating_company_id = cb.operating_company_id
      WHERE cb.active = true
      ORDER BY cb.factoring_company_name
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_summary
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS active_factor_id,
        NULL::text AS active_factor_name,
        90::int AS recourse_days,
        0::numeric AS reserve_balance,
        0::numeric AS chargeback_balance,
        NULL::timestamptz AS last_advance_at,
        0::int AS active_factor_count,
        true AS single_factor_invariant_ok,
        0::int AS mtd_advances_count,
        0::numeric AS mtd_advanced_total
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.factoring_recourse_at_risk
      WITH (security_invoker = true) AS
      WITH active_factor AS (
        SELECT
          fs.operating_company_id,
          fs.active_factor_name,
          fs.recourse_days
        FROM views.factoring_summary fs
      )
      SELECT
        fa.id AS factoring_advance_id,
        fa.operating_company_id,
        af.active_factor_name,
        COALESCE(NULLIF(to_jsonb(fa)->>'invoice_number', ''), NULLIF(to_jsonb(fa)->>'invoice_id', ''), fa.id::text) AS invoice_reference,
        COALESCE(NULLIF(to_jsonb(fa)->>'customer_name', ''), NULLIF(to_jsonb(fa)->>'customer_display_name', ''), 'Unknown Customer')::text AS customer_name,
        COALESCE(NULLIF(to_jsonb(fa)->>'invoice_total', '')::numeric, NULLIF(to_jsonb(fa)->>'invoice_amount', '')::numeric, COALESCE(NULLIF(to_jsonb(fa)->>'advance_amount', '')::numeric, 0))::numeric AS invoice_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'advance_amount', '')::numeric, 0)::numeric AS advance_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'reserve_amount', '')::numeric, 0)::numeric AS reserve_amount,
        fa.created_at AS factored_at,
        (fa.created_at + (COALESCE(af.recourse_days, 90) || ' days')::interval)::date AS recourse_expiry_date,
        GREATEST(0, (COALESCE(af.recourse_days, 90) - (CURRENT_DATE - fa.created_at::date)))::int AS days_until_recourse_expiry
      FROM accounting.factoring_advances fa
      LEFT JOIN active_factor af ON af.operating_company_id = fa.operating_company_id
      WHERE fa.created_at >= now() - interval '90 days'
      ORDER BY days_until_recourse_expiry ASC, fa.created_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_recourse_at_risk
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS factoring_advance_id,
        NULL::uuid AS operating_company_id,
        NULL::text AS active_factor_name,
        NULL::text AS invoice_reference,
        NULL::text AS customer_name,
        0::numeric AS invoice_amount,
        0::numeric AS advance_amount,
        0::numeric AS reserve_amount,
        NULL::timestamptz AS factored_at,
        NULL::date AS recourse_expiry_date,
        0::int AS days_until_recourse_expiry
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.factoring_chargebacks_fees
      WITH (security_invoker = true) AS
      SELECT
        fa.id AS factoring_advance_id,
        fa.operating_company_id,
        fa.created_at,
        date_trunc('month', fa.created_at)::date AS statement_month,
        COALESCE(NULLIF(to_jsonb(fa)->>'chargeback_amount', '')::numeric, 0)::numeric AS chargeback_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'factor_fee_amount', '')::numeric, NULLIF(to_jsonb(fa)->>'fee_amount', '')::numeric, 0)::numeric AS factor_fee_amount,
        COALESCE(NULLIF(to_jsonb(fa)->>'statement_reference', ''), NULLIF(to_jsonb(fa)->>'memo', ''), fa.id::text) AS statement_reference
      FROM accounting.factoring_advances fa
      ORDER BY fa.created_at DESC
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_chargebacks_fees
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS factoring_advance_id,
        NULL::uuid AS operating_company_id,
        NULL::timestamptz AS created_at,
        NULL::date AS statement_month,
        0::numeric AS chargeback_amount,
        0::numeric AS factor_fee_amount,
        NULL::text AS statement_reference
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_companies') IS NOT NULL THEN
    EXECUTE $VIEW$
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
    $VIEW$;
  ELSE
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_statements_settings
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS active_factor_id,
        NULL::text AS active_factor_name,
        90::int AS recourse_days,
        0::int AS active_factor_count,
        true AS single_factor_invariant_ok,
        NULL::date AS statement_month,
        0::numeric AS month_chargebacks_total,
        0::numeric AS month_factor_fees_total
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

COMMIT;
