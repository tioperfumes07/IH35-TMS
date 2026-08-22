-- ACCT-F5901 — views.factoring_chargebacks_fees never selected the real advance dollar amount at
-- all, unlike its sibling views.factoring_recourse_at_risk (202612970000:71), which already
-- correctly powers Recourse Pipeline's "Advance $1,794.50" for the same invoice. Because the
-- column was simply absent from the view, the frontend's ChargebacksTable.tsx Advance column was
-- never bound to a dollar field in the first place — it fell back to rendering
-- fa.memo/display_id via EntityLink (the same free-text string the neighboring "Statement Ref"
-- column also shows), not corrupted data, just a missing view column with no frontend field to
-- read. Live-confirmed: accounting.factoring_advances.advance_amount_cents holds a real, correct
-- cents figure for this row (bound at INSERT time by scripts/run-u6-factoring-advance-once.mts,
-- completely separate from the memo/notes free-text field).
--
-- Additive view replace only (CREATE OR REPLACE VIEW, security_invoker=true) — no table/column
-- change, no GL math, no data mutated. advance_amount is appended at the end of the SELECT list
-- (CREATE OR REPLACE VIEW is append-only; a mid-list insert errors "cannot change name of view
-- column"). views.factoring_statements_settings (which aggregates this view) benefits
-- automatically, no separate change needed there.

BEGIN;

DO $$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL THEN
    RAISE NOTICE 'ACCT-F5901: accounting.factoring_advances absent — skip chargebacks/fees view repoint';
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
      COALESCE(NULLIF(fa.memo, ''), fa.display_id, fa.id::text) AS statement_reference,
      -- ACCT-F5901: real advance dollar amount, mirroring views.factoring_recourse_at_risk's
      -- already-live advance_amount column exactly. Appended last (view-append-only rule).
      (fa.advance_amount_cents::numeric / 100) AS advance_amount
    FROM accounting.factoring_advances fa
    ORDER BY fa.created_at DESC
  $CBF$;

  GRANT SELECT ON views.factoring_chargebacks_fees TO ih35_app;
END
$$;

COMMIT;
