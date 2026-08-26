-- FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY
--
-- views.factoring_summary's `chargeback_balance` column (and the sibling
-- /api/v1/banking/factoring-virtual endpoint's own copy of the same computation) is named
-- "chargeback" but is actually SUM(outstanding_liability_signed_cents) — Factoring Advance +
-- Factoring Reserves still owed to the factor (ih35-accounting-decisions §3). A real chargeback
-- means an invoice was recoursed; per views.factoring_chargebacks_fees's own header comment
-- (202613080000), NO real chargeback dollar-amount data model exists yet — that view hardcodes
-- `0::numeric AS chargeback_amount` explicitly, honestly, until one is built. So the correct fix
-- here is NOT to split this into a real chargeback metric (that would require inventing a new
-- accounting data model this migration has no authority to invent) — it is to stop mislabeling
-- an already-correct, already-useful number (outstanding liability) as something it is not.
--
-- CREATE OR REPLACE VIEW is append-only (cannot rename/drop an existing output column), so
-- `chargeback_balance` stays in place for any other reader; `outstanding_liability_balance` is
-- appended as the honestly-named column every consumer should migrate to. Additive, idempotent,
-- no GL math, no table mutated.

BEGIN;

DO $$
BEGIN
  IF to_regclass('views.factoring_balance_invoice_linkage') IS NULL THEN
    RAISE NOTICE 'FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY: views.factoring_balance_invoice_linkage absent — skip factoring_summary repoint';
    RETURN;
  END IF;

  EXECUTE $SUMMARY$
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
      s.mtd_advanced_total,
      -- FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY: same value as
      -- chargeback_balance above (both compute outstanding_liability_signed_cents) — appended
      -- under its honest name. New consumers read this column; chargeback_balance stays for
      -- any reader not yet migrated.
      s.current_chargeback_balance AS outstanding_liability_balance
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
        ON v.id = fr.factor_vendor_id
       AND v.operating_company_id = fr.operating_company_id
      LEFT JOIN mtd_advances ma
        ON ma.operating_company_id = fr.operating_company_id
       AND ma.factor_vendor_id = fr.factor_vendor_id
    ) s
    ORDER BY active_factor_name, active_factor_id
  $SUMMARY$;

  GRANT SELECT ON views.factoring_summary TO ih35_app;
END
$$;

COMMIT;
