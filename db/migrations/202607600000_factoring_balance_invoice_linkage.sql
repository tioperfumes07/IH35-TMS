-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] 0280-05-factoring-balance-invoice-linkage
--
-- *** DO NOT RUN ON PROD without Jorge's explicit "OK to merge" — runs on a Neon branch first, then
-- ledger-backfilled (§1.4). FACTORING_GL_POSTING_ENABLED / QBO write-back stay OFF. ***
--
-- HELD PREREQUISITE (fail-closed — do NOT silently skip reverse-exclusion semantics):
--   MUST apply held migration 202607340000_je_reversal_linkage.sql FIRST.
--   This migration references accounting.journal_entries.reverses_je_id / reversed_by_je_id.
--   Declared in db/migrations/.held-migrations.json via requires_held.
--
-- CPA VETO (exact head bb8b80f9f → ee7ba85ee → this revision):
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
--   5) Faro identity = owner-seeded entity-scoped factoring.canonical_factor_agreements
--      (FARO_FULL_RECOURSE_V1 + effective dates + locked full-recourse terms). NEVER label a
--      generic sole factor as Faro. No invented UUIDs in this migration (owner seeds mapping).
--
-- FIX (additive, read-only + FORCE RLS hardening):
--   1) FORCE RLS on accounting.factoring_advances; SELECT entity-scoped; INSERT/UPDATE entity-scoped
--      AND Owner/Administrator role-gated; least-privilege grants (no DELETE).
--   2) views.factoring_balance_invoice_linkage (security_invoker) — factor-scoped advance grain.
--   3) factoring.canonical_factor_agreements — empty owner-seed table (no seed rows).
--      No new GL math. No QBO write-back. No destructive DDL.
--
-- Idempotent / apply-twice safe. Fresh-DB-from-0001 safe (to_regclass guards).

BEGIN;

-- ── 0. Fail-closed prerequisite: held 202607340000 reversal linkage columns ─────────────────────
DO $prereq$
DECLARE
  missing text[];
BEGIN
  SELECT COALESCE(array_agg(req.col ORDER BY req.col), ARRAY[]::text[])
    INTO missing
  FROM (
    VALUES ('reverses_je_id'), ('reversed_by_je_id')
  ) AS req(col)
  WHERE NOT EXISTS (
    SELECT 1
      FROM information_schema.columns c
     WHERE c.table_schema = 'accounting'
       AND c.table_name = 'journal_entries'
       AND c.column_name = req.col
  );

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION
      'HELD_MIGRATION_PREREQUISITE_MISSING: 202607600000_factoring_balance_invoice_linkage requires held 202607340000_je_reversal_linkage (missing accounting.journal_entries.%). Apply 202607340000 first. Fail-closed — refusing to create a view that would silently NULL-filter reversal semantics.',
      array_to_string(missing, ', ');
  END IF;
END
$prereq$;

-- ── 0b. Owner-seeded Faro agreement binding (NO seed rows — never invent UUIDs) ──────────────────
-- CANONICAL-CHECK: faro_agreement_binding. factoring.canonical_factor_agreements is NOT a money
--   ledger and NOT a second factoring.* advance/reserve/batch ledger. It is an owner-seeded
--   entity-scoped AGREEMENT/PROFILE BINDING (effective-dated FARO_FULL_RECOURSE_V1 contract terms
--   + factoring.factor profile + mdata.vendors factor vendor). Distinct from factoring.batch,
--   factoring.reserve_movement, accounting.factoring_advances, and factor.* Faro import staging —
--   those remain the operational/money surfaces. This table only answers "which vendor is Faro
--   for this entity as-of date under locked full-recourse terms?" with typed unverifiable when
--   unseeded/ambiguous. Empty by default; never invent UUIDs.
CREATE SCHEMA IF NOT EXISTS factoring;

DO $faro_agreement$
BEGIN
  IF to_regclass('factoring.factor') IS NULL OR to_regclass('mdata.vendors') IS NULL THEN
    RAISE NOTICE '202607600000: factoring.factor or mdata.vendors absent — skipping canonical_factor_agreements';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS factoring.canonical_factor_agreements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES org.companies(id),
    factor_profile_id uuid NOT NULL REFERENCES factoring.factor(id),
    factor_vendor_id uuid NOT NULL REFERENCES mdata.vendors(id),
    agreement_code text NOT NULL
      CHECK (agreement_code = 'FARO_FULL_RECOURSE_V1'),
    effective_from date NOT NULL,
    effective_to date,
    is_full_recourse boolean NOT NULL DEFAULT true
      CHECK (is_full_recourse = true),
    fee_rate_tier1 numeric(5,4) NOT NULL
      CHECK (fee_rate_tier1 = 0.0150),
    fee_rate_tier2 numeric(5,4) NOT NULL
      CHECK (fee_rate_tier2 = 0.0200),
    reserve_rate numeric(5,4) NOT NULL
      CHECK (reserve_rate = 0.0150),
    repurchase_term_days integer NOT NULL
      CHECK (repurchase_term_days = 30),
    grace_days integer NOT NULL
      CHECK (grace_days = 5),
    repurchase_deadline_days integer NOT NULL
      CHECK (repurchase_deadline_days = 95),
    default_interest_daily_rate numeric(10,8) NOT NULL
      CHECK (default_interest_daily_rate = 0.00067000),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by_user_id uuid REFERENCES identity.users(id),
    CHECK (effective_to IS NULL OR effective_to >= effective_from),
    UNIQUE (tenant_id, factor_vendor_id, agreement_code, effective_from)
  );

  CREATE INDEX IF NOT EXISTS idx_canonical_factor_agreements_tenant_asof
    ON factoring.canonical_factor_agreements (tenant_id, agreement_code, effective_from DESC);

  COMMENT ON TABLE factoring.canonical_factor_agreements IS
    'Owner-seeded entity-scoped Faro full-recourse agreement binding (0280-05). Empty by default — never invent vendor/profile UUIDs. Service resolves Factoring Balance Faro identity only through an effective-dated FARO_FULL_RECOURSE_V1 row whose locked terms match contract-config; sole-factor inference is forbidden.';

  ALTER TABLE factoring.canonical_factor_agreements ENABLE ROW LEVEL SECURITY;
  ALTER TABLE factoring.canonical_factor_agreements FORCE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS canonical_factor_agreements_entity_select ON factoring.canonical_factor_agreements;
  DROP POLICY IF EXISTS canonical_factor_agreements_entity_insert ON factoring.canonical_factor_agreements;
  DROP POLICY IF EXISTS canonical_factor_agreements_entity_update ON factoring.canonical_factor_agreements;

  CREATE POLICY canonical_factor_agreements_entity_select
    ON factoring.canonical_factor_agreements
    FOR SELECT
    TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR tenant_id::text = current_setting('app.operating_company_id', true)
    );

  CREATE POLICY canonical_factor_agreements_entity_insert
    ON factoring.canonical_factor_agreements
    FOR INSERT
    TO ih35_app
    WITH CHECK (
      identity.is_lucia_bypass()
      OR (
        tenant_id::text = current_setting('app.operating_company_id', true)
        AND identity.current_user_role() = ANY (
          ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
        )
      )
    );

  CREATE POLICY canonical_factor_agreements_entity_update
    ON factoring.canonical_factor_agreements
    FOR UPDATE
    TO ih35_app
    USING (
      identity.is_lucia_bypass()
      OR (
        tenant_id::text = current_setting('app.operating_company_id', true)
        AND identity.current_user_role() = ANY (
          ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
        )
      )
    )
    WITH CHECK (
      identity.is_lucia_bypass()
      OR (
        tenant_id::text = current_setting('app.operating_company_id', true)
        AND identity.current_user_role() = ANY (
          ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum]
        )
      )
    );

  GRANT USAGE ON SCHEMA factoring TO ih35_app;
  GRANT SELECT, INSERT, UPDATE ON factoring.canonical_factor_agreements TO ih35_app;
  REVOKE DELETE ON factoring.canonical_factor_agreements FROM ih35_app;
END
$faro_agreement$;

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
