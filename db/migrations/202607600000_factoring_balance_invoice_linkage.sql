-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] 0280-05-factoring-balance-invoice-linkage
--
-- *** DO NOT RUN ON PROD without Jorge's explicit "OK to merge" — runs on a Neon branch first, then
-- ledger-backfilled (§1.4). FACTORING_GL_POSTING_ENABLED / QBO write-back stay OFF. ***
--
-- ROOT CAUSE: GET /api/v1/home/factoring-balance read a superseded factoring rollup (migration 0124)
-- that sourced reserve figures from accounting.factoring_companies (never written) and fabricated $0
-- on catch. Independent VETO (2026-07-19): mutable factoring_advances.status must NOT clear liability
-- or zero reserve; legs come only from structural posted JE / reserve-movement artifacts.
--
-- FIX (additive, read-only + FORCE RLS hardening):
--   1) FORCE RLS on accounting.factoring_advances; SELECT entity-scoped; INSERT/UPDATE entity-scoped
--      AND Owner/Administrator role-gated; least-privilege grants (no DELETE).
--   2) views.factoring_balance_invoice_linkage (security_invoker) — Faro-vendor scoped:
--        liability from JE postings on role factoring_advance_liability (live JE only)
--        reserve from JE postings on role factor_reserve_held (live JE only)
--        recourse relief = liability debits on JEs that also post to factoring_recoursed_ar
--        invoice_count = COUNT(DISTINCT invoice.id) — money never JOIN-summed (fanout ban)
--        incomplete artifact counters for fail-closed service gates
--      No new GL math. No QBO write-back. No destructive DDL.
--
-- Idempotent / apply-twice safe. Fresh-DB-from-0001 safe (to_regclass guards).

BEGIN;

-- ── 1. FORCE RLS + entity SELECT + Owner/Admin write on accounting.factoring_advances ───────────────
DO $rls$
BEGIN
  IF to_regclass('accounting.factoring_advances') IS NULL THEN
    RAISE NOTICE '202607600000: accounting.factoring_advances absent — skipping FORCE RLS';
    RETURN;
  END IF;

  ALTER TABLE accounting.factoring_advances ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.factoring_advances FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS factoring_advances_company_scope ON accounting.factoring_advances;
  DROP POLICY IF EXISTS factoring_advances_entity_select ON accounting.factoring_advances;
  DROP POLICY IF EXISTS factoring_advances_entity_insert ON accounting.factoring_advances;
  DROP POLICY IF EXISTS factoring_advances_entity_update ON accounting.factoring_advances;
  DROP POLICY IF EXISTS factoring_advances_entity_write ON accounting.factoring_advances;

  CREATE POLICY factoring_advances_entity_select
    ON accounting.factoring_advances
    FOR SELECT
    TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR operating_company_id::text = current_setting('app.operating_company_id', true)
    );

  CREATE POLICY factoring_advances_entity_insert
    ON accounting.factoring_advances
    FOR INSERT
    TO ih35_app
    WITH CHECK (
      identity.is_lucia_bypass()
      OR (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        AND identity.current_user_role() = ANY (
          ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
        )
      )
    );

  CREATE POLICY factoring_advances_entity_update
    ON accounting.factoring_advances
    FOR UPDATE
    TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        AND identity.current_user_role() = ANY (
          ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
        )
      )
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR (
        operating_company_id::text = current_setting('app.operating_company_id', true)
        AND identity.current_user_role() = ANY (
          ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
        )
      )
    );

  GRANT SELECT, INSERT, UPDATE ON accounting.factoring_advances TO ih35_app;
  REVOKE DELETE ON accounting.factoring_advances FROM ih35_app;
END
$rls$;

-- ── 2. Invoice-grain + JE-artifact factoring balance rollup (security_invoker) ─────────────────────
CREATE SCHEMA IF NOT EXISTS views;

DO $view$
BEGIN
  -- Column shape changed vs prior HOLD draft — DROP then CREATE (CREATE OR REPLACE cannot rename cols).
  EXECUTE 'DROP VIEW IF EXISTS views.factoring_balance_invoice_linkage';

  IF to_regclass('accounting.factoring_advances') IS NULL
     OR to_regclass('accounting.invoices') IS NULL
     OR to_regclass('accounting.journal_entry_postings') IS NULL
     OR to_regclass('accounting.journal_entries') IS NULL
     OR to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    EXECUTE $EMPTY$
      CREATE VIEW views.factoring_balance_invoice_linkage
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS operating_company_id,
        NULL::uuid AS faro_factor_vendor_id,
        0::bigint AS liability_credits_cents,
        0::bigint AS liability_debits_settled_cents,
        0::bigint AS liability_debits_recourse_cents,
        0::bigint AS outstanding_liability_cents,
        0::bigint AS reserve_debits_cents,
        0::bigint AS reserve_credits_cents,
        0::bigint AS reserve_receivable_cents,
        0::bigint AS funded_cents,
        0::bigint AS settled_cents,
        0::bigint AS recourse_buyback_cents,
        0::int AS invoice_count,
        0::int AS funded_advance_count,
        0::int AS faro_advances_without_funding_artifact,
        0::int AS faro_advances_with_reserve_missing_held_artifact
      WHERE false
    $EMPTY$;
  ELSE
    EXECUTE $LIVE$
      CREATE VIEW views.factoring_balance_invoice_linkage
      WITH (security_invoker = true) AS
      WITH faro_vendors AS (
        -- Active Faro factor per company from customer assignment majority (no hard-coded UUID).
        SELECT
          c.operating_company_id,
          c.factoring_company_vendor_id AS faro_factor_vendor_id
        FROM (
          SELECT
            operating_company_id,
            factoring_company_vendor_id,
            COUNT(*)::int AS n,
            ROW_NUMBER() OVER (
              PARTITION BY operating_company_id
              ORDER BY COUNT(*) DESC, factoring_company_vendor_id ASC
            ) AS rn
          FROM mdata.customers
          WHERE factoring_company_vendor_id IS NOT NULL
          GROUP BY operating_company_id, factoring_company_vendor_id
        ) c
        JOIN mdata.vendors v
          ON v.id = c.factoring_company_vendor_id
         AND v.operating_company_id = c.operating_company_id
         AND v.deactivated_at IS NULL
         -- POSIX has no \\b word-boundary; ILIKE is the portable Faro-name match.
         AND v.vendor_name ILIKE '%faro%'
        WHERE c.rn = 1
      ),
      live_je AS (
        SELECT je.id, je.operating_company_id
        FROM accounting.journal_entries je
        WHERE je.status = 'posted'
          AND je.voided_at IS NULL
          AND je.reverses_je_id IS NULL
          AND je.reversed_by_je_id IS NULL
      ),
      liability_legs AS (
        SELECT
          jep.operating_company_id,
          jep.journal_entry_uuid,
          jep.debit_or_credit,
          jep.amount_cents
        FROM accounting.journal_entry_postings jep
        JOIN live_je je ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
         AND r.role = 'factoring_advance_liability'
      ),
      recourse_jes AS (
        SELECT DISTINCT jep.operating_company_id, jep.journal_entry_uuid
        FROM accounting.journal_entry_postings jep
        JOIN live_je je ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
         AND r.role = 'factoring_recoursed_ar'
      ),
      liability_roll AS (
        SELECT
          ll.operating_company_id,
          COALESCE(SUM(ll.amount_cents) FILTER (WHERE ll.debit_or_credit = 'credit'), 0)::bigint
            AS liability_credits_cents,
          COALESCE(SUM(ll.amount_cents) FILTER (
            WHERE ll.debit_or_credit = 'debit'
              AND NOT EXISTS (
                SELECT 1 FROM recourse_jes rj
                WHERE rj.operating_company_id = ll.operating_company_id
                  AND rj.journal_entry_uuid = ll.journal_entry_uuid
              )
          ), 0)::bigint AS liability_debits_settled_cents,
          COALESCE(SUM(ll.amount_cents) FILTER (
            WHERE ll.debit_or_credit = 'debit'
              AND EXISTS (
                SELECT 1 FROM recourse_jes rj
                WHERE rj.operating_company_id = ll.operating_company_id
                  AND rj.journal_entry_uuid = ll.journal_entry_uuid
              )
          ), 0)::bigint AS liability_debits_recourse_cents
        FROM liability_legs ll
        GROUP BY ll.operating_company_id
      ),
      reserve_roll AS (
        SELECT
          jep.operating_company_id,
          COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'debit'), 0)::bigint
            AS reserve_debits_cents,
          COALESCE(SUM(jep.amount_cents) FILTER (WHERE jep.debit_or_credit = 'credit'), 0)::bigint
            AS reserve_credits_cents
        FROM accounting.journal_entry_postings jep
        JOIN live_je je ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
         AND r.role = 'factor_reserve_held'
        GROUP BY jep.operating_company_id
      ),
      faro_advances AS (
        SELECT fa.*
        FROM accounting.factoring_advances fa
        JOIN faro_vendors fv
          ON fv.operating_company_id = fa.operating_company_id
         AND fv.faro_factor_vendor_id = fa.factoring_company_vendor_id
        WHERE fa.advanced_at IS NOT NULL
          -- voided advances excluded from operational advance set; status NEVER clears open liability
          AND fa.status <> 'voided'
      ),
      funding_artifact AS (
        -- Structural funding evidence only (no memo/status):
        --   (a) live JE credit on factoring_advance_liability with source_transaction_* = advance, OR
        --   (b) factoring_reserve_movements.held linked to a live journal_entry_id.
        SELECT DISTINCT fa.id AS factoring_advance_id, fa.operating_company_id
        FROM faro_advances fa
        WHERE EXISTS (
          SELECT 1
          FROM accounting.journal_entry_postings jep
          JOIN live_je je ON je.id = jep.journal_entry_uuid
           AND je.operating_company_id = jep.operating_company_id
          JOIN accounting.chart_of_accounts_roles r
            ON r.account_id = jep.account_id
           AND r.operating_company_id = jep.operating_company_id
           AND r.is_active = true
           AND r.role = 'factoring_advance_liability'
          WHERE jep.operating_company_id = fa.operating_company_id
            AND jep.debit_or_credit = 'credit'
            AND jep.source_transaction_type = 'factoring_advance'
            AND jep.source_transaction_id = fa.id::text
        )
        OR EXISTS (
          SELECT 1
          FROM accounting.factoring_reserve_movements m
          JOIN live_je je ON je.id = m.journal_entry_id
           AND je.operating_company_id = m.operating_company_id
          WHERE m.factoring_advance_id = fa.id
            AND m.operating_company_id = fa.operating_company_id
            AND m.movement_type = 'held'
            AND m.is_active = true
            AND m.journal_entry_id IS NOT NULL
        )
      ),
      reserve_held_artifact AS (
        SELECT DISTINCT fa.id AS factoring_advance_id, fa.operating_company_id
        FROM faro_advances fa
        WHERE fa.reserve_amount_cents > 0
          AND (
            EXISTS (
              SELECT 1
              FROM accounting.journal_entry_postings jep
              JOIN live_je je ON je.id = jep.journal_entry_uuid
               AND je.operating_company_id = jep.operating_company_id
              JOIN accounting.chart_of_accounts_roles r
                ON r.account_id = jep.account_id
               AND r.operating_company_id = jep.operating_company_id
               AND r.is_active = true
               AND r.role = 'factor_reserve_held'
              WHERE jep.operating_company_id = fa.operating_company_id
                AND jep.debit_or_credit = 'debit'
                AND jep.source_transaction_type = 'factoring_advance'
                AND jep.source_transaction_id = fa.id::text
            )
            OR EXISTS (
              SELECT 1
              FROM accounting.factoring_reserve_movements m
              JOIN live_je je ON je.id = m.journal_entry_id
               AND je.operating_company_id = m.operating_company_id
              WHERE m.factoring_advance_id = fa.id
                AND m.operating_company_id = fa.operating_company_id
                AND m.movement_type = 'held'
                AND m.is_active = true
                AND m.journal_entry_id IS NOT NULL
            )
          )
      ),
      invoice_roll AS (
        SELECT
          fa.operating_company_id,
          fv.faro_factor_vendor_id,
          COUNT(DISTINCT i.id)::int AS invoice_count
        FROM faro_advances fa
        JOIN faro_vendors fv
          ON fv.operating_company_id = fa.operating_company_id
         AND fv.faro_factor_vendor_id = fa.factoring_company_vendor_id
        INNER JOIN accounting.invoices i
          ON i.factoring_advance_id = fa.id
         AND i.operating_company_id = fa.operating_company_id
         AND i.voided_at IS NULL
        GROUP BY fa.operating_company_id, fv.faro_factor_vendor_id
      ),
      advance_roll AS (
        SELECT
          fa.operating_company_id,
          fv.faro_factor_vendor_id,
          COUNT(*)::int AS funded_advance_count,
          COUNT(*) FILTER (WHERE fund.factoring_advance_id IS NULL)::int
            AS faro_advances_without_funding_artifact,
          COUNT(*) FILTER (
            WHERE fa.reserve_amount_cents > 0 AND rh.factoring_advance_id IS NULL
          )::int AS faro_advances_with_reserve_missing_held_artifact
        FROM faro_advances fa
        JOIN faro_vendors fv
          ON fv.operating_company_id = fa.operating_company_id
         AND fv.faro_factor_vendor_id = fa.factoring_company_vendor_id
        LEFT JOIN funding_artifact fund
          ON fund.factoring_advance_id = fa.id
         AND fund.operating_company_id = fa.operating_company_id
        LEFT JOIN reserve_held_artifact rh
          ON rh.factoring_advance_id = fa.id
         AND rh.operating_company_id = fa.operating_company_id
        GROUP BY fa.operating_company_id, fv.faro_factor_vendor_id
      )
      SELECT
        fv.operating_company_id,
        fv.faro_factor_vendor_id,
        COALESCE(lr.liability_credits_cents, 0)::bigint AS liability_credits_cents,
        COALESCE(lr.liability_debits_settled_cents, 0)::bigint AS liability_debits_settled_cents,
        COALESCE(lr.liability_debits_recourse_cents, 0)::bigint AS liability_debits_recourse_cents,
        GREATEST(
          0,
          COALESCE(lr.liability_credits_cents, 0)
            - COALESCE(lr.liability_debits_settled_cents, 0)
            - COALESCE(lr.liability_debits_recourse_cents, 0)
        )::bigint AS outstanding_liability_cents,
        COALESCE(rr.reserve_debits_cents, 0)::bigint AS reserve_debits_cents,
        COALESCE(rr.reserve_credits_cents, 0)::bigint AS reserve_credits_cents,
        GREATEST(
          0,
          COALESCE(rr.reserve_debits_cents, 0) - COALESCE(rr.reserve_credits_cents, 0)
        )::bigint AS reserve_receivable_cents,
        COALESCE(lr.liability_credits_cents, 0)::bigint AS funded_cents,
        COALESCE(lr.liability_debits_settled_cents, 0)::bigint AS settled_cents,
        COALESCE(lr.liability_debits_recourse_cents, 0)::bigint AS recourse_buyback_cents,
        COALESCE(ir.invoice_count, 0)::int AS invoice_count,
        COALESCE(ar.funded_advance_count, 0)::int AS funded_advance_count,
        COALESCE(ar.faro_advances_without_funding_artifact, 0)::int
          AS faro_advances_without_funding_artifact,
        COALESCE(ar.faro_advances_with_reserve_missing_held_artifact, 0)::int
          AS faro_advances_with_reserve_missing_held_artifact
      FROM faro_vendors fv
      LEFT JOIN liability_roll lr ON lr.operating_company_id = fv.operating_company_id
      LEFT JOIN reserve_roll rr ON rr.operating_company_id = fv.operating_company_id
      LEFT JOIN invoice_roll ir
        ON ir.operating_company_id = fv.operating_company_id
       AND ir.faro_factor_vendor_id = fv.faro_factor_vendor_id
      LEFT JOIN advance_roll ar
        ON ar.operating_company_id = fv.operating_company_id
       AND ar.faro_factor_vendor_id = fv.faro_factor_vendor_id
    $LIVE$;
  END IF;
END
$view$;

GRANT SELECT ON views.factoring_balance_invoice_linkage TO ih35_app;

COMMENT ON VIEW views.factoring_balance_invoice_linkage IS
  '0280-05: Factoring Balance = outstanding Faro LIABILITY from live JE legs on factoring_advance_liability; reserve from factor_reserve_held; COUNT(DISTINCT invoice.id); statuses never clear balances. security_invoker. HOLD 202607600000.';

COMMIT;
