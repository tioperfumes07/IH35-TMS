-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] 0280-05-factoring-balance-invoice-linkage
--
-- *** DO NOT RUN ON PROD without Jorge's explicit "OK to merge" — runs on a Neon branch first, then
-- ledger-backfilled (§1.4). FACTORING_GL_POSTING_ENABLED / QBO write-back stay OFF. ***
--
-- CPA VETO (exact head bb8b80f9f → this revision):
--   1) Liability/reserve ONLY from per-advance/per-factor JE + source-link artifacts.
--      Unrelated/orphan role-account JEs are NEVER attributed to the active factor.
--      No majority-customer inference; no vendor-name ILIKE match.
--   2) NEVER clamp debit-liability / over-released-reserve anomalies to zero — surface signed
--      diagnostic cents (GREATEST removed from balances).
--   3) As-of boundary via GUC app.factoring_balance_as_of (company business date); future-dated
--      posted JEs excluded.
--   4) Lifecycle classification from authoritative source_transaction_type /
--      transaction_source_links.relationship_role / factoring_reserve_movements — NOT account
--      co-occurrence on the same JE.
--
-- FIX (additive, read-only + FORCE RLS hardening):
--   1) FORCE RLS on accounting.factoring_advances; SELECT entity-scoped; INSERT/UPDATE entity-scoped
--      AND Owner/Administrator role-gated; least-privilege grants (no DELETE).
--   2) views.factoring_balance_invoice_linkage (security_invoker) — factor-scoped advance grain.
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

-- ── 2. Per-factor / per-advance JE-artifact factoring balance rollup (security_invoker) ──────────
CREATE SCHEMA IF NOT EXISTS views;

DO $view$
BEGIN
  -- Column reshape on HOLD draft: DROP VIEW IF EXISTS only for THIS view (CREATE OR REPLACE cannot
  -- rename columns). Additive-only elsewhere — never DROP TABLE/COLUMN. Guard forbids DROP TABLE.
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
        NULL::uuid AS factor_vendor_id,
        NULL::date AS as_of_business_date,
        0::bigint AS liability_credits_cents,
        0::bigint AS liability_debits_settled_cents,
        0::bigint AS liability_debits_recourse_cents,
        0::bigint AS outstanding_liability_signed_cents,
        0::bigint AS reserve_debits_cents,
        0::bigint AS reserve_credits_cents,
        0::bigint AS reserve_receivable_signed_cents,
        0::bigint AS funded_cents,
        0::bigint AS settled_cents,
        0::bigint AS recourse_buyback_cents,
        0::int AS invoice_count,
        0::int AS funded_advance_count,
        0::int AS factor_advances_without_funding_artifact,
        0::int AS factor_advances_with_reserve_missing_held_artifact,
        0::bigint AS orphan_liability_role_cents,
        0::bigint AS orphan_reserve_role_cents
      WHERE false
    $EMPTY$;
  ELSE
    EXECUTE $LIVE$
      CREATE VIEW views.factoring_balance_invoice_linkage
      WITH (security_invoker = true) AS
      WITH as_of AS (
        SELECT COALESCE(
          NULLIF(current_setting('app.factoring_balance_as_of', true), '')::date,
          (CURRENT_TIMESTAMP AT TIME ZONE 'America/Chicago')::date
        ) AS d
      ),
      live_je AS (
        SELECT je.id, je.operating_company_id, je.entry_date
        FROM accounting.journal_entries je
        CROSS JOIN as_of a
        WHERE je.status = 'posted'
          AND je.voided_at IS NULL
          AND je.reverses_je_id IS NULL
          AND je.reversed_by_je_id IS NULL
          AND je.entry_date <= a.d
      ),
      -- Authoritative advance↔posting link: source_transaction_* OR TSL only.
      -- Bare factoring_reserve_movements→JE is NOT sufficient (code-review VETO #2).
      advance_linked_postings AS (
        SELECT
          fa.id AS factoring_advance_id,
          fa.operating_company_id,
          fa.factoring_company_vendor_id AS factor_vendor_id,
          jep.id AS journal_entry_posting_id,
          jep.journal_entry_uuid,
          jep.account_id,
          jep.debit_or_credit,
          jep.amount_cents,
          jep.source_transaction_type,
          COALESCE(
            NULLIF(jep.source_transaction_type, ''),
            tsl.relationship_role
          ) AS lifecycle_source
        FROM accounting.factoring_advances fa
        JOIN accounting.journal_entry_postings jep
          ON jep.operating_company_id = fa.operating_company_id
        JOIN live_je je
          ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        LEFT JOIN accounting.transaction_source_links tsl
          ON tsl.journal_entry_posting_id = jep.id
         AND tsl.operating_company_id = jep.operating_company_id
         AND tsl.linked_object_type = 'factoring_advance'
         AND tsl.linked_object_id = fa.id::text
        WHERE fa.advanced_at IS NOT NULL
          AND fa.status <> 'voided'
          AND (
            (
              jep.source_transaction_type IN (
                'factoring_advance',
                'factoring_customer_payment',
                'factoring_reserve_release',
                'factoring_chargeback',
                'factoring_default_interest'
              )
              AND jep.source_transaction_id = fa.id::text
            )
            OR tsl.id IS NOT NULL
          )
          AND COALESCE(
            NULLIF(jep.source_transaction_type, ''),
            tsl.relationship_role
          ) IS NOT NULL
      ),
      liability_legs AS (
        SELECT alp.*
        FROM advance_linked_postings alp
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = alp.account_id
         AND r.operating_company_id = alp.operating_company_id
         AND r.is_active = true
         AND r.role = 'factoring_advance_liability'
      ),
      reserve_legs AS (
        SELECT alp.*
        FROM advance_linked_postings alp
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = alp.account_id
         AND r.operating_company_id = alp.operating_company_id
         AND r.is_active = true
         AND r.role = 'factor_reserve_held'
      ),
      liability_roll AS (
        SELECT
          ll.operating_company_id,
          ll.factor_vendor_id,
          COALESCE(SUM(ll.amount_cents) FILTER (
            WHERE ll.debit_or_credit = 'credit'
              AND ll.lifecycle_source IN ('factoring_advance', 'factoring_default_interest', 'factoring_funding')
          ), 0)::bigint AS liability_credits_cents,
          COALESCE(SUM(ll.amount_cents) FILTER (
            WHERE ll.debit_or_credit = 'debit'
              AND ll.lifecycle_source IN ('factoring_customer_payment', 'factoring_settlement')
          ), 0)::bigint AS liability_debits_settled_cents,
          COALESCE(SUM(ll.amount_cents) FILTER (
            WHERE ll.debit_or_credit = 'debit'
              AND ll.lifecycle_source IN ('factoring_chargeback', 'factoring_recourse')
          ), 0)::bigint AS liability_debits_recourse_cents
        FROM liability_legs ll
        GROUP BY ll.operating_company_id, ll.factor_vendor_id
      ),
      reserve_roll AS (
        SELECT
          rl.operating_company_id,
          rl.factor_vendor_id,
          COALESCE(SUM(rl.amount_cents) FILTER (
            WHERE rl.debit_or_credit = 'debit'
              AND rl.lifecycle_source IN ('factoring_advance', 'factoring_funding', 'factoring_reserve_held')
          ), 0)::bigint AS reserve_debits_cents,
          COALESCE(SUM(rl.amount_cents) FILTER (
            WHERE rl.debit_or_credit = 'credit'
              AND rl.lifecycle_source IN ('factoring_reserve_release', 'factoring_reserve_released')
          ), 0)::bigint AS reserve_credits_cents
        FROM reserve_legs rl
        GROUP BY rl.operating_company_id, rl.factor_vendor_id
      ),
      factor_advances AS (
        SELECT fa.*
        FROM accounting.factoring_advances fa
        WHERE fa.advanced_at IS NOT NULL
          AND fa.status <> 'voided'
      ),
      -- Funding completeness: MUST have a live liability CREDIT leg with advance lifecycle source.
      -- A reserve_movements row pointing at an empty/unrelated JE is NOT sufficient (code-review VETO #2).
      funding_artifact AS (
        SELECT DISTINCT fa.id AS factoring_advance_id, fa.operating_company_id, fa.factoring_company_vendor_id AS factor_vendor_id
        FROM factor_advances fa
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
            AND (
              (
                jep.source_transaction_type IN ('factoring_advance', 'factoring_default_interest')
                AND jep.source_transaction_id = fa.id::text
              )
              OR EXISTS (
                SELECT 1
                FROM accounting.transaction_source_links tsl
                WHERE tsl.journal_entry_posting_id = jep.id
                  AND tsl.operating_company_id = jep.operating_company_id
                  AND tsl.linked_object_type = 'factoring_advance'
                  AND tsl.linked_object_id = fa.id::text
                  AND tsl.relationship_role IN (
                    'factoring_funding', 'factoring_advance', 'factoring_default_interest'
                  )
              )
            )
        )
      ),
      -- Reserve-held completeness: live reserve DEBIT leg with advance lifecycle source (not bare movement→JE).
      reserve_held_artifact AS (
        SELECT DISTINCT fa.id AS factoring_advance_id, fa.operating_company_id, fa.factoring_company_vendor_id AS factor_vendor_id
        FROM factor_advances fa
        WHERE fa.reserve_amount_cents > 0
          AND EXISTS (
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
              AND (
                (
                  jep.source_transaction_type = 'factoring_advance'
                  AND jep.source_transaction_id = fa.id::text
                )
                OR EXISTS (
                  SELECT 1
                  FROM accounting.transaction_source_links tsl
                  WHERE tsl.journal_entry_posting_id = jep.id
                    AND tsl.operating_company_id = jep.operating_company_id
                    AND tsl.linked_object_type = 'factoring_advance'
                    AND tsl.linked_object_id = fa.id::text
                    AND tsl.relationship_role IN ('factoring_funding', 'factoring_advance', 'factoring_reserve_held')
                )
              )
          )
      ),
      invoice_roll AS (
        SELECT
          fa.operating_company_id,
          fa.factoring_company_vendor_id AS factor_vendor_id,
          COUNT(DISTINCT i.id)::int AS invoice_count
        FROM factor_advances fa
        INNER JOIN accounting.invoices i
          ON i.factoring_advance_id = fa.id
         AND i.operating_company_id = fa.operating_company_id
         AND i.voided_at IS NULL
        GROUP BY fa.operating_company_id, fa.factoring_company_vendor_id
      ),
      advance_roll AS (
        SELECT
          fa.operating_company_id,
          fa.factoring_company_vendor_id AS factor_vendor_id,
          COUNT(*)::int AS funded_advance_count,
          COUNT(*) FILTER (WHERE fund.factoring_advance_id IS NULL)::int
            AS factor_advances_without_funding_artifact,
          COUNT(*) FILTER (
            WHERE fa.reserve_amount_cents > 0 AND rh.factoring_advance_id IS NULL
          )::int AS factor_advances_with_reserve_missing_held_artifact
        FROM factor_advances fa
        LEFT JOIN funding_artifact fund
          ON fund.factoring_advance_id = fa.id
         AND fund.operating_company_id = fa.operating_company_id
        LEFT JOIN reserve_held_artifact rh
          ON rh.factoring_advance_id = fa.id
         AND rh.operating_company_id = fa.operating_company_id
        GROUP BY fa.operating_company_id, fa.factoring_company_vendor_id
      ),
      -- Orphan role-account legs: posted to liability/reserve roles but NOT advance-linked.
      orphan_roll AS (
        SELECT
          jep.operating_company_id,
          COALESCE(SUM(jep.amount_cents) FILTER (
            WHERE r.role = 'factoring_advance_liability'
              AND NOT EXISTS (
                SELECT 1 FROM advance_linked_postings alp
                WHERE alp.journal_entry_posting_id = jep.id
              )
          ), 0)::bigint AS orphan_liability_role_cents,
          COALESCE(SUM(jep.amount_cents) FILTER (
            WHERE r.role = 'factor_reserve_held'
              AND NOT EXISTS (
                SELECT 1 FROM advance_linked_postings alp
                WHERE alp.journal_entry_posting_id = jep.id
              )
          ), 0)::bigint AS orphan_reserve_role_cents
        FROM accounting.journal_entry_postings jep
        JOIN live_je je ON je.id = jep.journal_entry_uuid
         AND je.operating_company_id = jep.operating_company_id
        JOIN accounting.chart_of_accounts_roles r
          ON r.account_id = jep.account_id
         AND r.operating_company_id = jep.operating_company_id
         AND r.is_active = true
         AND r.role IN ('factoring_advance_liability', 'factor_reserve_held')
        GROUP BY jep.operating_company_id
      ),
      factor_keys AS (
        SELECT DISTINCT operating_company_id, factoring_company_vendor_id AS factor_vendor_id
        FROM factor_advances
      )
      SELECT
        fk.operating_company_id,
        fk.factor_vendor_id,
        (SELECT d FROM as_of) AS as_of_business_date,
        COALESCE(lr.liability_credits_cents, 0)::bigint AS liability_credits_cents,
        COALESCE(lr.liability_debits_settled_cents, 0)::bigint AS liability_debits_settled_cents,
        COALESCE(lr.liability_debits_recourse_cents, 0)::bigint AS liability_debits_recourse_cents,
        (
          COALESCE(lr.liability_credits_cents, 0)
            - COALESCE(lr.liability_debits_settled_cents, 0)
            - COALESCE(lr.liability_debits_recourse_cents, 0)
        )::bigint AS outstanding_liability_signed_cents,
        COALESCE(rr.reserve_debits_cents, 0)::bigint AS reserve_debits_cents,
        COALESCE(rr.reserve_credits_cents, 0)::bigint AS reserve_credits_cents,
        (
          COALESCE(rr.reserve_debits_cents, 0) - COALESCE(rr.reserve_credits_cents, 0)
        )::bigint AS reserve_receivable_signed_cents,
        COALESCE(lr.liability_credits_cents, 0)::bigint AS funded_cents,
        COALESCE(lr.liability_debits_settled_cents, 0)::bigint AS settled_cents,
        COALESCE(lr.liability_debits_recourse_cents, 0)::bigint AS recourse_buyback_cents,
        COALESCE(ir.invoice_count, 0)::int AS invoice_count,
        COALESCE(ar.funded_advance_count, 0)::int AS funded_advance_count,
        COALESCE(ar.factor_advances_without_funding_artifact, 0)::int
          AS factor_advances_without_funding_artifact,
        COALESCE(ar.factor_advances_with_reserve_missing_held_artifact, 0)::int
          AS factor_advances_with_reserve_missing_held_artifact,
        COALESCE(o.orphan_liability_role_cents, 0)::bigint AS orphan_liability_role_cents,
        COALESCE(o.orphan_reserve_role_cents, 0)::bigint AS orphan_reserve_role_cents
      FROM factor_keys fk
      LEFT JOIN liability_roll lr
        ON lr.operating_company_id = fk.operating_company_id
       AND lr.factor_vendor_id = fk.factor_vendor_id
      LEFT JOIN reserve_roll rr
        ON rr.operating_company_id = fk.operating_company_id
       AND rr.factor_vendor_id = fk.factor_vendor_id
      LEFT JOIN invoice_roll ir
        ON ir.operating_company_id = fk.operating_company_id
       AND ir.factor_vendor_id = fk.factor_vendor_id
      LEFT JOIN advance_roll ar
        ON ar.operating_company_id = fk.operating_company_id
       AND ar.factor_vendor_id = fk.factor_vendor_id
      LEFT JOIN orphan_roll o ON o.operating_company_id = fk.operating_company_id
    $LIVE$;
  END IF;
END
$view$;

GRANT SELECT ON views.factoring_balance_invoice_linkage TO ih35_app;

COMMENT ON VIEW views.factoring_balance_invoice_linkage IS
  '0280-05 CPA: Factoring Balance = per-factor advance-linked JE legs (source_transaction_type/TSL/reserve_movements); signed diagnostics (no clamp); as-of via app.factoring_balance_as_of; orphans excluded; security_invoker. HOLD 202607600000.';

COMMIT;
