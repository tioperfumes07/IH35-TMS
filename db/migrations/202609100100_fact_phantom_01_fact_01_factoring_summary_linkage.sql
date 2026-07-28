-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] FACT-PHANTOM-01 + FACT-01
-- DO NOT RUN ON PROD via db:migrate. Jorge applies on a Neon branch, then ledger-backfills.
--
-- ROOT CAUSE: views.factoring_summary was conditionally sourced from a retired factoring-company
-- profile. When that relation was absent, it emitted a WHERE-false placeholder rather than the
-- actual per-factor, advance-linked ledger balances.
--
-- FIX: rebuild the summary from views.factoring_balance_invoice_linkage. Reserve and outstanding
-- liability remain signed ledger cents until this presentation view normalizes them to dollars.
-- No posting, GL math, QBO write-back, table mutation, or phantom relation is introduced.
--
-- PREREQUISITE: held 202607600000_factoring_balance_invoice_linkage.sql.

BEGIN;

DO $prerequisite$
BEGIN
  IF to_regclass('views.factoring_balance_invoice_linkage') IS NULL THEN
    RAISE EXCEPTION
      'HELD_MIGRATION_PREREQUISITE_MISSING: 202609100100_fact_phantom_01_fact_01_factoring_summary_linkage requires held 202607600000_factoring_balance_invoice_linkage.sql';
  END IF;
END
$prerequisite$;

CREATE OR REPLACE VIEW views.factoring_summary
WITH (security_invoker = true) AS
WITH linkage AS (
  SELECT
    f.operating_company_id,
    f.factor_vendor_id,
    f.as_of_business_date,
    f.reserve_receivable_signed_cents,
    f.outstanding_liability_signed_cents,
    f.funded_advance_count,
    f.funded_cents
  FROM views.factoring_balance_invoice_linkage f
  WHERE f.operating_company_id IS NOT NULL
    AND f.factor_vendor_id IS NOT NULL
),
factor_rollup AS (
  SELECT
    operating_company_id,
    factor_vendor_id,
    MAX(as_of_business_date) AS as_of_business_date,
    SUM(reserve_receivable_signed_cents)::bigint AS reserve_receivable_signed_cents,
    SUM(outstanding_liability_signed_cents)::bigint AS outstanding_liability_signed_cents,
    SUM(funded_advance_count)::int AS funded_advance_count,
    SUM(funded_cents)::bigint AS funded_cents
  FROM linkage
  GROUP BY operating_company_id, factor_vendor_id
),
factor_counts AS (
  SELECT
    operating_company_id,
    COUNT(*)::int AS active_factor_count
  FROM factor_rollup
  GROUP BY operating_company_id
),
mtd_advances AS (
  SELECT
    fa.operating_company_id,
    fa.factoring_company_vendor_id AS factor_vendor_id,
    COUNT(*)::int AS mtd_advances_count,
    SUM(fa.advance_amount_cents)::numeric / 100 AS mtd_advanced_total
  FROM accounting.factoring_advances fa
  WHERE fa.status IS DISTINCT FROM 'voided'
    AND fa.created_at >= date_trunc('month', CURRENT_TIMESTAMP)
  GROUP BY fa.operating_company_id, fa.factoring_company_vendor_id
)
-- Outer alias keeps the permanent dollars-unit contract:
-- consumers + verify-factoring-summary-dollars-unit expect
-- `current_reserve_balance AS reserve_balance` (dollars, not raw cents).
SELECT
  s.operating_company_id,
  s.active_factor_id,
  s.active_factor_name,
  s.recourse_days,
  s.current_reserve_balance AS reserve_balance,
  s.current_chargeback_balance AS chargeback_balance,
  s.last_advance_at,
  s.active_factor_count,
  s.single_factor_invariant_ok,
  s.mtd_advances_count,
  s.mtd_advanced_total
FROM (
  SELECT
    fr.operating_company_id,
    fr.factor_vendor_id AS active_factor_id,
    COALESCE(v.vendor_name, 'Factoring')::text AS active_factor_name,
    95::int AS recourse_days,
    (fr.reserve_receivable_signed_cents::numeric / 100)::numeric AS current_reserve_balance,
    (fr.outstanding_liability_signed_cents::numeric / 100)::numeric AS current_chargeback_balance,
    NULL::timestamptz AS last_advance_at,
    fc.active_factor_count,
    (fc.active_factor_count <= 1) AS single_factor_invariant_ok,
    COALESCE(ma.mtd_advances_count, 0)::int AS mtd_advances_count,
    COALESCE(ma.mtd_advanced_total, 0)::numeric AS mtd_advanced_total
  FROM factor_rollup fr
  JOIN factor_counts fc
    ON fc.operating_company_id = fr.operating_company_id
  LEFT JOIN mdata.vendors v
    ON v.operating_company_id = fr.operating_company_id
   AND v.id = fr.factor_vendor_id
  LEFT JOIN mtd_advances ma
    ON ma.operating_company_id = fr.operating_company_id
   AND ma.factor_vendor_id = fr.factor_vendor_id
) s
ORDER BY s.active_factor_name, s.active_factor_id;

GRANT SELECT ON views.factoring_summary TO ih35_app;

COMMENT ON VIEW views.factoring_summary IS
  'FACT-01: real per-factor summary from factoring_balance_invoice_linkage. Reserve and outstanding liability originate as signed, advance-linked ledger cents; this read-only view normalizes display values to dollars. security_invoker; HOLD 202609100100.';

COMMIT;
