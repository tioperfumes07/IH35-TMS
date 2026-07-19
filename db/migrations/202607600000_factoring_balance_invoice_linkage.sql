-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] 0280-05-factoring-balance-invoice-linkage
--
-- *** DO NOT RUN ON PROD without Jorge's explicit "OK to merge" — runs on a Neon branch first, then
-- ledger-backfilled (§1.4). FACTORING_GL_POSTING_ENABLED / QBO write-back stay OFF. ***
--
-- ROOT CAUSE: GET /api/v1/home/factoring-balance read a superseded factoring rollup (migration 0124)
-- that sourced reserve figures from accounting.factoring_companies (never never written) and
-- mtd advanced totals from jsonb advance_amount (dead path). The earlier 0061 invoice-grain
-- definition was superseded. Fake-zero catch then hid query failures as $0.
-- NOTE: This migration does NOT redefine the legacy factoring rollup view — it adds a NEW
-- security_invoker view (views.factoring_balance_invoice_linkage) for the Home balance contract.
--
-- FIX (additive, read-only):
--   1) FORCE RLS + canonical lucia-bypass policy on accounting.factoring_advances (defense-in-depth;
--      ENABLE alone is insufficient for owner/elevated connections).
--   2) Create views.factoring_balance_invoice_linkage (security_invoker) at advance grain with
--      COUNT(DISTINCT invoice.id) — no JOIN fanout on money columns. Formula (owner 2026-07-19):
--        outstanding_liability = funded − settled(collections/reserve releases) − recourse buybacks
--        reserve_receivable = separate 1.5% short-term asset, NEVER netted into liability
--      Uses existing posted artifacts on accounting.factoring_advances + accounting.invoices only.
--      No new GL math. No QBO write-back.
--
-- Idempotent / apply-twice safe. Fresh-DB-from-0001 safe (to_regclass guards).

BEGIN;

-- ── 1. FORCE RLS + canonical entity policy on accounting.factoring_advances ─────────────────────────
DO $rls$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL THEN
    RAISE NOTICE '202607600000: accounting.factoring_advances absent — skipping FORCE RLS';
    RETURN;
  END IF;

  ALTER TABLE accounting.factoring_advances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.factoring_advances FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS factoring_advances_company_scope ON accounting.factoring_advances;
  CREATE POLICY factoring_advances_company_scope
    ON accounting.factoring_advances
    FOR ALL TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );

  GRANT SELECT, INSERT, UPDATE ON accounting.factoring_advances TO ih35_app;
  -- void-not-delete: do not grant DELETE (revoke if DEFAULT PRIVILEGES widened it)
  REVOKE DELETE ON accounting.factoring_advances FROM ih35_app;
END
$rls$;

-- ── 2. Invoice-grain factoring balance rollup (security_invoker; additive new view) ────────────────
CREATE SCHEMA IF NOT EXISTS views;

DO $view$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL
     OR to_regclass('accounting.invoices') IS NULL THEN
    -- Empty stub so fresh-DB consumers can still SELECT the shape (service probes columns).
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.factoring_balance_invoice_linkage
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        0::bigint AS outstanding_liability_cents,
        0::bigint AS reserve_receivable_cents,
        0::bigint AS funded_cents,
        0::bigint AS settled_cents,
        0::bigint AS recourse_buyback_cents,
        0::int AS invoice_count,
        0::int AS funded_advance_count
      WHERE false
    $EMPTY$;
  ELSE
    EXECUTE $LIVE$
      CREATE OR REPLACE VIEW views.factoring_balance_invoice_linkage
      WITH (security_invoker = true) AS
      WITH funded_advances AS (
        -- Advance grain ONLY — money columns never joined to invoices (fanout ban).
        SELECT
          fa.id,
          fa.operating_company_id,
          fa.status,
          fa.invoice_total_cents,
          fa.reserve_amount_cents,
          fa.release_amount_cents
        FROM accounting.factoring_advances fa
        WHERE fa.status <> 'voided'
          AND fa.advanced_at IS NOT NULL
      ),
      advance_roll AS (
        SELECT
          fa.operating_company_id,
          -- Funded face = full Net liability credited at funding (CHAIN-06 / ASC 860 secured borrowing).
          COALESCE(SUM(fa.invoice_total_cents), 0)::bigint AS funded_cents,
          -- Settled by customer collections / reserve-release lifecycle (liability relieved).
          COALESCE(SUM(fa.invoice_total_cents) FILTER (
            WHERE fa.status IN ('reserve_held', 'collected', 'released')
          ), 0)::bigint AS settled_cents,
          -- Recourse buybacks (carrier repays Faro).
          COALESCE(SUM(fa.invoice_total_cents) FILTER (
            WHERE fa.status = 'recourse_returned'
          ), 0)::bigint AS recourse_buyback_cents,
          -- Separate 1.5% reserve receivable (short-term asset) — NEVER netted into liability.
          COALESCE(SUM(
            CASE
              WHEN fa.status IN ('advanced', 'disputed', 'reserve_held', 'collected')
                THEN fa.reserve_amount_cents
              WHEN fa.status = 'released'
                THEN GREATEST(0, fa.reserve_amount_cents - COALESCE(fa.release_amount_cents, 0))
              ELSE 0
            END
          ), 0)::bigint AS reserve_receivable_cents,
          COUNT(*)::int AS funded_advance_count
        FROM funded_advances fa
        GROUP BY fa.operating_company_id
      ),
      invoice_roll AS (
        SELECT
          fa.operating_company_id,
          COUNT(DISTINCT i.id)::int AS invoice_count
        FROM funded_advances fa
        INNER JOIN accounting.invoices i
          ON i.factoring_advance_id = fa.id
         AND i.operating_company_id = fa.operating_company_id
         AND i.voided_at IS NULL
        GROUP BY fa.operating_company_id
      )
      SELECT
        ar.operating_company_id,
        GREATEST(0, ar.funded_cents - ar.settled_cents - ar.recourse_buyback_cents)::bigint
          AS outstanding_liability_cents,
        ar.reserve_receivable_cents,
        ar.funded_cents,
        ar.settled_cents,
        ar.recourse_buyback_cents,
        COALESCE(ir.invoice_count, 0)::int AS invoice_count,
        ar.funded_advance_count
      FROM advance_roll ar
      LEFT JOIN invoice_roll ir ON ir.operating_company_id = ar.operating_company_id
    $LIVE$;
  END IF;
END
$view$;

GRANT SELECT ON views.factoring_balance_invoice_linkage TO ih35_app;

COMMENT ON VIEW views.factoring_balance_invoice_linkage IS
  '0280-05: Factoring Balance = outstanding Faro secured-borrowing LIABILITY (funded − settled − recourse); Factoring Reserves = separate receivable; invoice_count = COUNT(DISTINCT invoices.id). security_invoker. HOLD migration 202607600000.';

COMMIT;
