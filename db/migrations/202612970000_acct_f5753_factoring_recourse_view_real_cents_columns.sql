-- ACCT-F5753 — views.factoring_recourse_at_risk's invoice_amount/advance_amount/reserve_amount/
-- invoice_reference/customer_name columns were sourced via to_jsonb(fa.*)->>'<key>' dynamic key
-- lookups against key names that DO NOT EXIST on accounting.factoring_advances at all
-- ('invoice_amount', 'advance_amount', 'reserve_amount', 'invoice_number', 'invoice_id',
-- 'customer_name', 'customer_display_name', 'invoice_total' — confirmed live via
-- information_schema.columns: zero of those names match any real column). Every COALESCE chain
-- therefore always fell through to its fallback: invoice_amount/advance_amount/reserve_amount = 0,
-- invoice_reference = the advance's own uuid, customer_name = 'Unknown Customer' — for EVERY row,
-- regardless of how much real data exists. The real columns are invoice_total_cents/
-- advance_amount_cents/reserve_amount_cents (bigint, cents) — this repoints onto them (dollars via
-- /100, matching this view's own pre-existing dollars-unit contract for reserve_balance/
-- chargeback_balance) and adds a real invoice_reference/customer_name via the actual FK path
-- (accounting.invoices.factoring_advance_id -> factoring_advances.id -> mdata.customers via
-- invoices.customer_id), the same reverse-linkage direction factoring.routes.ts's own LEFT JOIN
-- LATERAL already uses for invoice_id/customer_id/load_id.
--
-- Additive view replace only (CREATE OR REPLACE VIEW, security_invoker=true) — no table/column
-- changes, no GL math, no data mutated. Idempotent + guarded behind to_regclass, matching every
-- prior migration in this view's history (0052/0124/202609010000).

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL THEN
    RAISE NOTICE 'ACCT-F5753: accounting.factoring_advances absent — skip recourse view repoint';
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
    ),
    -- ACCT-F5753: real reverse-FK join (accounting.invoices.factoring_advance_id -> fa.id) instead of
    -- a dead JSONB key probe. LATERAL + LIMIT 1 mirrors factoring.routes.ts's own existing pattern for
    -- resolving "the" invoice behind an advance — live-confirmed 1:1 cardinality on prod today, but
    -- LATERAL keeps this view correct even if a future advance batches multiple invoices.
    linked_invoice AS (
      SELECT
        fa.id AS factoring_advance_id,
        inv.display_id AS invoice_display_id,
        inv.customer_id
      FROM accounting.factoring_advances fa
      LEFT JOIN LATERAL (
        SELECT i.display_id, i.customer_id
        FROM accounting.invoices i
        WHERE i.factoring_advance_id = fa.id
          AND i.operating_company_id = fa.operating_company_id
          AND i.voided_at IS NULL
        ORDER BY i.created_at DESC
        LIMIT 1
      ) inv ON true
    )
    SELECT
      fa.id AS factoring_advance_id,
      fa.operating_company_id,
      NULL::text AS active_factor_name,
      COALESCE(li.invoice_display_id, fa.display_id, fa.id::text) AS invoice_reference,
      COALESCE(c.customer_name, 'Unknown Customer')::text AS customer_name,
      (fa.invoice_total_cents::numeric / 100) AS invoice_amount,
      (fa.advance_amount_cents::numeric / 100) AS advance_amount,
      (fa.reserve_amount_cents::numeric / 100) AS reserve_amount,
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
    LEFT JOIN linked_invoice li ON li.factoring_advance_id = fa.id
    LEFT JOIN mdata.customers c
      ON c.id = li.customer_id
     AND c.operating_company_id = fa.operating_company_id
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

  GRANT SELECT ON views.factoring_recourse_at_risk TO ih35_app;
END
$$;

COMMIT;
