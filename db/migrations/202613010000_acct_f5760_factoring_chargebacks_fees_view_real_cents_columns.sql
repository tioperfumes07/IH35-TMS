-- ACCT-F5760 — views.factoring_chargebacks_fees's factor_fee_amount column was sourced via a
-- to_jsonb(fa.*)->>'<key>' dynamic key lookup against key names ("factor_fee_amount", "fee_amount")
-- that DO NOT EXIST on accounting.factoring_advances at all — confirmed live via
-- information_schema.columns: the real column is factor_fee_cents (bigint, cents). The COALESCE chain
-- therefore always falls through to 0 regardless of the real fee — same defect class as ACCT-F5753
-- (views.factoring_recourse_at_risk, PR #13911, already merged+live).
--
-- statement_reference's dead-key lookup for "statement_reference" (also not a real column) happened to
-- fall through to the same dynamic-lookup pattern against "memo", which IS a real column name, so it
-- coincidentally worked — hardened here to read fa.memo directly instead of relying on a fragile
-- dynamic-key coincidence.
--
-- chargeback_amount has NO backing column anywhere on accounting.factoring_advances, and no dedicated
-- factoring-chargeback table exists in this schema (confirmed live: information_schema.tables has only
-- driver_finance.abandonment_chargebacks, an unrelated driver/load-abandonment concept, not a factoring
-- recourse chargeback). This is NOT a dead-key bug — it is a genuinely untracked field. Per the
-- origin-classification law, this migration does not invent chargeback data; it replaces the phantom-key
-- lookup with an explicit 0::numeric literal so the code honestly says "not tracked yet" instead of
-- appearing to read real data through a lookup that can never resolve.
--
-- Additive view replace only (CREATE OR REPLACE VIEW, security_invoker=true) — no table/column changes,
-- no GL math, no data mutated. views.factoring_statements_settings (which aggregates this view) benefits
-- automatically, no separate change needed there.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL THEN
    RAISE NOTICE 'ACCT-F5760: accounting.factoring_advances absent — skip chargebacks/fees view repoint';
    RETURN;
  END IF;

  EXECUTE $CBF$
    CREATE OR REPLACE VIEW views.factoring_chargebacks_fees
    WITH (security_invoker = true) AS
    SELECT
      fa.id AS factoring_advance_id,
      fa.operating_company_id,
      fa.created_at,
      date_trunc('month', fa.created_at)::date AS statement_month,
      -- ACCT-F5760: no chargeback dollar-amount column/table exists yet for factoring advances;
      -- explicit 0 (not a phantom-key lookup) until a real data model lands.
      0::numeric AS chargeback_amount,
      (fa.factor_fee_cents::numeric / 100) AS factor_fee_amount,
      COALESCE(NULLIF(fa.memo, ''), fa.display_id, fa.id::text) AS statement_reference
    FROM accounting.factoring_advances fa
    ORDER BY fa.created_at DESC
  $CBF$;

  GRANT SELECT ON views.factoring_chargebacks_fees TO ih35_app;
END
$$;

COMMIT;
