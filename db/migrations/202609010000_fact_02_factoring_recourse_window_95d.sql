-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] FACT-02 — Faro recourse window = 95d off advanced_at (not 90d/created_at).
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
--
-- ROOT CAUSE: views.factoring_recourse_at_risk aged off created_at with COALESCE(..., 90) and pruned
--   WHERE created_at >= now()-90d. Worse: it LEFT JOINed views.factoring_summary (often empty /
--   stub), so af.recourse_days was NULL and every row fell through to the 90 default — understating
--   Faro's 95-day repurchase deadline and dropping advances still inside the true window.
--   views.factoring_summary also defaulted recourse_days to 90.
-- Locked constant: FACTORING_REPURCHASE_DEADLINE_DAYS = 95 (contract-config.ts).
--
-- FIX: recreate both views (security_invoker) — summary keeps 0124 dollars-unit shape
--   (current_reserve_balance AS reserve_balance) with default 95; recourse ages off
--   COALESCE(advanced_at, created_at), default 95, prefer canonical agreement days, prune 120d.
-- Additive view replace only; no table drops; no GL.
-- RENUMBER 2026-07-27 (BAND FIX): was 202609010000_fact_02_factoring_recourse_window_95d.sql —
-- outside Cursor band 20260901xxxx–20260910xxxx (Rules of Engagement). Body unchanged;
-- Neon already applied under the old filename — dual-ledger stamp adds this new name.

BEGIN;

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
          COALESCE(NULLIF(to_jsonb(fc)->>'recourse_days', '')::int, 95) AS recourse_days
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
      WITH dollars AS (
        SELECT 0::numeric AS current_reserve_balance, 0::numeric AS current_chargeback_balance
      )
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS active_factor_id,
        NULL::text AS active_factor_name,
        95::int AS recourse_days,
        d.current_reserve_balance AS reserve_balance,
        d.current_chargeback_balance AS chargeback_balance,
        NULL::timestamptz AS last_advance_at,
        0::int AS active_factor_count,
        true AS single_factor_invariant_ok,
        0::int AS mtd_advances_count,
        0::numeric AS mtd_advanced_total
      FROM dollars d
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL THEN
    RAISE NOTICE 'FACT-02: accounting.factoring_advances absent — skip recourse view rewrite';
    RETURN;
  END IF;

  EXECUTE $RISK$
    CREATE OR REPLACE VIEW views.factoring_recourse_at_risk
    WITH (security_invoker = true) AS
    WITH agreement_days AS (
      SELECT DISTINCT ON (a.tenant_id)
        a.tenant_id AS operating_company_id,
        a.repurchase_deadline_days
      FROM factoring.canonical_factor_agreements a
      WHERE a.voided_at IS NULL
        AND a.effective_from <= CURRENT_DATE
        AND (a.effective_to IS NULL OR a.effective_to >= CURRENT_DATE)
        AND a.agreement_code = 'FARO_FULL_RECOURSE_V1'
      ORDER BY a.tenant_id, a.effective_from DESC
    )
    SELECT
      fa.id AS factoring_advance_id,
      fa.operating_company_id,
      NULL::text AS active_factor_name,
      COALESCE(
        NULLIF(to_jsonb(fa.*)->>'invoice_number', ''),
        NULLIF(to_jsonb(fa.*)->>'invoice_id', ''),
        fa.id::text
      ) AS invoice_reference,
      COALESCE(
        NULLIF(to_jsonb(fa.*)->>'customer_name', ''),
        NULLIF(to_jsonb(fa.*)->>'customer_display_name', ''),
        'Unknown Customer'
      )::text AS customer_name,
      COALESCE(
        NULLIF(to_jsonb(fa.*)->>'invoice_total', '')::numeric,
        NULLIF(to_jsonb(fa.*)->>'invoice_amount', '')::numeric,
        COALESCE(NULLIF(to_jsonb(fa.*)->>'advance_amount', '')::numeric, 0)
      )::numeric AS invoice_amount,
      COALESCE(NULLIF(to_jsonb(fa.*)->>'advance_amount', '')::numeric, 0)::numeric AS advance_amount,
      COALESCE(NULLIF(to_jsonb(fa.*)->>'reserve_amount', '')::numeric, 0)::numeric AS reserve_amount,
      COALESCE(fa.advanced_at, fa.created_at) AS factored_at,
      (
        COALESCE(fa.advanced_at, fa.created_at)
        + (COALESCE(ag.repurchase_deadline_days, 95) || ' days')::interval
      )::date AS recourse_expiry_date,
      GREATEST(
        0,
        (
          COALESCE(ag.repurchase_deadline_days, 95)
          - (CURRENT_DATE - COALESCE(fa.advanced_at, fa.created_at)::date)
        )
      )::int AS days_until_recourse_expiry
    FROM accounting.factoring_advances fa
    LEFT JOIN agreement_days ag ON ag.operating_company_id = fa.operating_company_id
    WHERE COALESCE(fa.advanced_at, fa.created_at) >= now() - interval '120 days'
    ORDER BY
      GREATEST(
        0,
        (
          COALESCE(ag.repurchase_deadline_days, 95)
          - (CURRENT_DATE - COALESCE(fa.advanced_at, fa.created_at)::date)
        )
      ),
      COALESCE(fa.advanced_at, fa.created_at) DESC
  $RISK$;

  GRANT SELECT ON views.factoring_summary TO ih35_app;
  GRANT SELECT ON views.factoring_recourse_at_risk TO ih35_app;
END
$$;

COMMIT;
