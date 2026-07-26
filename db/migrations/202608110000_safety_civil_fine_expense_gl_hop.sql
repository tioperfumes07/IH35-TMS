-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] SAFETY FINE-GL HOP — the COMPANY-PAID civil-fine expense leg.
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. DO NOT flip
--     SAFETY_FINE_GL_POSTING_ENABLED. The posting flag is registered DEFAULT OFF and stays OFF until
--     final cutover. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. ***
--
-- CANONICAL-CHECK: civil_fine_expense_posting. accounting.civil_fine_postings is a LINKAGE/provenance
-- ledger (fine -> its expense JE), NOT a money ledger. It stores NO debit/credit and NO balance: the
-- money lives entirely in the canonical GL (accounting.journal_entries + its lines, written by the
-- shared accounting.createJournalEntry poster), and this table only records WHICH journal entry a given
-- safety.civil_fines row produced, plus the amount/date/memo echoed for audit and the idempotency latch.
-- No existing canonical ledger covers it: accounting.journal_entries is the GL itself and cannot record
-- per-fine provenance; accounting.bills / bill_payments / payments are A/P and A/R subledgers and a
-- civil fine is neither a vendor bill nor a customer receipt; driver_finance.driver_liabilities already
-- covers the OTHER fine treatment (driver-recovery) and is explicitly refused by this poster. This
-- mirrors accounting.property_tax_accruals (202607080310), the same rendition -> JE linkage shape.
-- It does not supersede or duplicate any registry concept (checked against
-- scripts/canonical-ledger-registry.json: no concept token collides with civil/fine/posting).
--
-- FINDING (the defect this closes)
-- safety.civil_fines has TWO owner-decided treatments:
--   (a) driver-recovery  -> driver_finance.driver_liabilities -> settlement deduction. ALREADY BUILT:
--       apps/backend/src/safety/fines.routes.ts:312 (POST /api/v1/safety/fines/:id/convert-to-liability)
--       inserts the liability and seeds the canonical settlement deduction.
--   (b) company-paid     -> expense JE to civil_fines_expense. **NOT BUILT.** The company-paid path
--       ends at fines.routes.ts:616 (POST /api/v1/safety/fines/:id/link-payment), which only stamps
--       paid_via_bank_transaction_id / paid_date / paid_amount_cents / status='paid' on the fine row.
--       No journal entry, no ledger row, no account. A fine the company EATS reaches NO ledger at all —
--       real cash leaves the bank and the P&L never sees the expense.
-- This migration adds ONLY the scaffolding that hop resolves against. It contains NO posting code and
-- NO GL math.
--
-- WHAT THIS MIGRATION DOES
--   §1 Register SAFETY_FINE_GL_POSTING_ENABLED in lib.feature_flags, default_enabled = FALSE
--      (per-entity kill switch; read via isEnabled(client, flag, {operating_company_id})).
--   §4 Widen BOTH closed-list CoA-role CHECKs as a TRUE SUPERSET to admit the new role
--      'civil_fines_expense'.
--   §2 CREATE accounting.civil_fine_postings — the fine -> expense-JE linkage ledger, so a posted fine is
--      drill-throughable in BOTH directions (fine -> JE, JE -> fine) per the Total-Connectivity law.
--   §3 FORCE RLS + grants + REVOKE DELETE on safety.civil_fines (it had ENABLE but never FORCE).
--      (the new accounting.civil_fine_postings ledger is locked down inline in §2.)
--
-- WHAT THIS MIGRATION DELIBERATELY DOES **NOT** DO
--   * It does NOT create any catalogs.accounts row, and it does NOT seed
--     accounting.chart_of_accounts_roles. The OWNER designates the account for civil_fines_expense via
--     the CoaRoles page. An agent never picks a GL account. Until the owner designates it, the resolver
--     fails CLOSED (CoaRoleResolutionError / COA_ROLE_MAPPING_NOT_FOUND) and nothing posts — which is
--     the correct safe state, on top of the flag already being OFF.
--   * civil_fines_expense is deliberately given NO shape-fallback entry in the resolver's
--     ROLE_FALLBACKS map, so it can never be silently matched to an account by name or subtype.
--   * It creates/imports/reclassifies/deactivates NO reserve, holdback or retainage account.
--   * It writes nothing to QuickBooks. Parallel books; QBO is never written.
--
-- ACCOUNTING (owner-decided; NOT re-litigated here)
--   COMPANY-PAID FINE:  Dr Civil Fines & Penalties (role civil_fines_expense)
--                       Cr Cash (role cash_clearing — an EXISTING role, already used by the
--                          property-tax poster; no new cash account is created)
--   Cash-basis-primary is the LOCKED basis for TRANSP (internal books + Ch.11 MOR are consistent):
--   debit expense, CREDIT bank/cash. The AP/accrual variant is the rare exception and is NOT built here.
--   Driver-recovery fines are OUT OF SCOPE of this leg — they already flow to driver_liabilities and a
--   settlement deduction, and the poster refuses any fine carrying converted_to_liability_id.
--
-- FRESH-DB SAFE: every statement is guarded by to_regclass(...) IS NOT NULL, so on a fresh CI DB built
-- from 0001 (where the objects are created earlier in the chain) it applies cleanly, and it NEVER RAISEs.
-- IDEMPOTENT: CREATE TABLE/INDEX IF NOT EXISTS / guarded ADD CONSTRAINT / DROP CONSTRAINT IF EXISTS +
-- ADD CONSTRAINT / ON CONFLICT DO NOTHING — a second apply is a clean no-op.
-- void-not-delete: no DROP TABLE, no DELETE, no TRUNCATE anywhere in this file.
--
-- CONCURRENCY NOTE (§4): the two CHECKs are rebuilt as a TRUE SUPERSET of main's CURRENT values —
-- chart_of_accounts_roles_role_check from 202607760000_cash_dip_coa_role.sql (36 values, the last
-- widener on main) and account_role_bindings_role_key_check from
-- 202607670000_settlement_coa_roles_widen_check.sql (31 values, the last widener on main), each plus
-- 'civil_fines_expense'. Verified against origin/main 2026-07-25. If a concurrently-held migration
-- widens the same CHECK first, reconcile the value list at apply time (Jorge applies held migrations
-- in order on the Neon branch).

BEGIN;

-- ORDERING NOTE: the CoA-role CHECK widening is deliberately placed LAST.
-- scripts/verify-schema-parity.mjs attributes ADD COLUMN/ADD-token fragments by scanning a fixed
-- 4096-char window forward from each `ALTER TABLE schema.table`, so a role-CHECK ALTER placed above
-- other DDL can absorb it and mis-attribute columns to accounting.chart_of_accounts_roles /
-- catalogs.account_role_bindings. Keeping the CHECK-only ALTERs last (where the window sees only
-- ADD CONSTRAINT) keeps the baseline honest without weakening that shared guard.

-- ===========================================================================================
-- §1 — Feature flag (per-entity kill switch), DEFAULT OFF.
--      Runtime read: isEnabled(client, 'SAFETY_FINE_GL_POSTING_ENABLED', {operating_company_id}).
--      NEVER a global env read; the key matches the `*_GL_POSTING_ENABLED` pattern that
--      lib/feature-flags/service.ts treats as per-entity-only, and it is ALSO enumerated explicitly in
--      POSTING_FLAG_KEYS so a global rollout/default can never turn fine posting on for every entity.
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
    VALUES (
      'SAFETY_FINE_GL_POSTING_ENABLED',
      'Safety fine-GL hop: COMPANY-PAID civil fine expense JE (Dr civil_fines_expense / Cr cash_clearing) '
        || 'posted when a fine payment is linked. Per-entity override only. Default OFF (kill switch) until '
        || 'the owner designates the civil_fines_expense account and authorizes cutover. Driver-recovery '
        || 'fines are NOT posted by this flag — they flow to driver_liabilities + settlement deduction.',
      false
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END
$$;

-- ===========================================================================================
-- §2 — Fine -> JE linkage LEDGER (Total-Connectivity law: forward AND reverse drill-through).
--      One active row per posted fine, carrying the expense JE. Written ONLY by the poster, ONLY when
--      the flag is ON. The partial unique index is the poster's idempotency latch: a fine that already
--      has an active posting row is never posted twice.
--
--      DESIGN NOTE — why a linkage TABLE in accounting.* and NOT columns on safety.civil_fines:
--      this mirrors the property-tax poster exactly (202607080310 created accounting.property_tax_accruals
--      rather than widening compliance.property_tax_renditions). It also keeps the posting ledger in the
--      schema that owns posting, and it avoids the real correctness trap that
--      scripts/verify-schema-parity-from-prod.mjs (SAF-F08) exists to catch: a HELD, not-yet-applied
--      migration that adds a SAFETY-lane column produces a migration-parsed baseline claiming a column
--      prod does not have, so safety code reading it would break silently on prod. A new accounting.*
--      table has no such false-PASS: the poster is inert until the flag is ON, and the flag cannot be
--      flipped before the owner applies this migration.
-- ===========================================================================================
-- Guarded on the accounting schema + the RLS bypass helper existing, so a bare/partial DB is a clean
-- no-op instead of an error. On a fresh CI DB built from 0001 both exist by the time this runs.
DO $$
BEGIN
  IF to_regclass('accounting.journal_entries') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'accounting')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'identity' AND p.proname = 'is_lucia_bypass') THEN
    RAISE NOTICE 'civil_fine_postings: prerequisites absent — skipping (clean no-op)';
  ELSE
  CREATE TABLE IF NOT EXISTS accounting.civil_fine_postings (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL,
    fine_id               uuid NOT NULL,
    expense_je_id         uuid,
    amount_cents          bigint NOT NULL CHECK (amount_cents > 0),
    entry_date            date NOT NULL,
    memo                  text,
    status                text NOT NULL DEFAULT 'posted'
                            CHECK (status IN ('posted','voided')),
    is_active             boolean NOT NULL DEFAULT true,
    voided_at             timestamptz,
    voided_by_user_id     uuid,
    void_reason           text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by_user_id    uuid
  );

  -- Guarded FKs: added separately so a fresh DB that has not yet built the referenced tables cannot
  -- fail the migration.
      IF to_regclass('org.companies') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_civil_fine_postings_company') THEN
        ALTER TABLE accounting.civil_fine_postings
          ADD CONSTRAINT fk_civil_fine_postings_company
          FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
      END IF;

      IF to_regclass('safety.civil_fines') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_civil_fine_postings_fine') THEN
        ALTER TABLE accounting.civil_fine_postings
          ADD CONSTRAINT fk_civil_fine_postings_fine
          FOREIGN KEY (fine_id) REFERENCES safety.civil_fines(id);
      END IF;

      IF to_regclass('accounting.journal_entries') IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_civil_fine_postings_je') THEN
        ALTER TABLE accounting.civil_fine_postings
          ADD CONSTRAINT fk_civil_fine_postings_je
          FOREIGN KEY (expense_je_id) REFERENCES accounting.journal_entries(id);
      END IF;

  -- Idempotency latch: at most ONE active posting per fine. A poster re-run finds it and no-ops.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_civil_fine_postings_fine_active
    ON accounting.civil_fine_postings (operating_company_id, fine_id)
    WHERE is_active;
  -- Reverse drill-through: JE -> the fine that produced it.
  CREATE INDEX IF NOT EXISTS ix_civil_fine_postings_je
    ON accounting.civil_fine_postings (expense_je_id) WHERE expense_je_id IS NOT NULL;

  ALTER TABLE accounting.civil_fine_postings ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.civil_fine_postings FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS civil_fine_postings_select ON accounting.civil_fine_postings;
  DROP POLICY IF EXISTS civil_fine_postings_write  ON accounting.civil_fine_postings;
  CREATE POLICY civil_fine_postings_select ON accounting.civil_fine_postings FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY civil_fine_postings_write ON accounting.civil_fine_postings FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  GRANT SELECT, INSERT, UPDATE ON accounting.civil_fine_postings TO ih35_app;
  REVOKE DELETE ON accounting.civil_fine_postings FROM ih35_app;
  END IF;
END
$$;

-- ===========================================================================================
-- §3 — Harden safety.civil_fines: FORCE RLS + grants + REVOKE DELETE (void-not-delete).
--      0050 set ENABLE ROW LEVEL SECURITY but never FORCE, so the table owner bypassed the policies.
--      The existing 0050 policies already admit identity.is_lucia_bypass() AND pin
--      operating_company_id = current_setting('app.operating_company_id'), and the poster sets that
--      GUC before every read/write — so FORCE is safe for the poster path.
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('safety.civil_fines') IS NOT NULL THEN
    ALTER TABLE safety.civil_fines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE safety.civil_fines FORCE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE ON safety.civil_fines TO ih35_app;
    REVOKE DELETE ON safety.civil_fines FROM ih35_app;
  END IF;
END
$$;

-- ===========================================================================================
-- §4 — Role registry: admit 'civil_fines_expense'. TRUE SUPERSET of main's current values.
--      NO account is created and NO role->account mapping is seeded — the owner designates.
-- ===========================================================================================
DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL THEN
    ALTER TABLE accounting.chart_of_accounts_roles
      DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
    ALTER TABLE accounting.chart_of_accounts_roles
      ADD CONSTRAINT chart_of_accounts_roles_role_check
      CHECK (role IN (
        -- 0223 base 12 (preserve ALL)
        'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
        'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
        'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
        -- FIN-22 lessor lease (ASC 842)
        'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
        -- CODER-34 factoring secured-borrowing
        'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar',
        'default_interest_expense','factor_reserve_held','factor_fee_expense',
        -- Business-Property Allocation
        'property_tax_expense','property_tax_payable',
        -- 202607670000 settlement / driver / fuel / period-close roles
        'driver_pay_expense','driver_payroll_clearing','reimbursement_expense',
        'advance_recovery','damage_recovery','lease_recovery','insurance_recovery',
        'fuel_advance_recovery','other_recovery',
        -- 202607710000 pay-run abandonment chargeback recovery
        'abandonment_chargeback_recovery',
        -- 202607760000 DIP operating cash
        'cash_dip',
        -- NEW (this migration) — company-paid civil fine / penalty expense. Owner designates the
        -- account; typically a non-deductible Penalties & Fines expense account.
        'civil_fines_expense'
      ));
  END IF;

  IF to_regclass('catalogs.account_role_bindings') IS NOT NULL THEN
    ALTER TABLE catalogs.account_role_bindings
      DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_check;
    ALTER TABLE catalogs.account_role_bindings
      ADD CONSTRAINT account_role_bindings_role_key_check CHECK (
        role_key = ANY (ARRAY[
          'ar_clearing', 'ap_clearing', 'cash_dip', 'cash_payroll', 'cash_petty',
          'fuel_expense', 'maintenance_expense', 'driver_payroll_clearing',
          'factor_advances_receivable', 'factor_chargebacks_payable', 'undeposited_funds',
          'driver_pay_expense', 'reimbursement_expense',
          'advance_recovery', 'damage_recovery', 'lease_recovery', 'insurance_recovery',
          'fuel_advance_recovery', 'other_recovery',
          'rental_income', 'lease_receivable', 'interest_income', 'gain_loss_on_disposal',
          'factoring_advance_liability', 'ar_assigned_to_factor', 'factoring_recoursed_ar',
          'default_interest_expense', 'factor_reserve_held', 'factor_fee_expense',
          'property_tax_expense', 'property_tax_payable',
          'abandonment_chargeback_recovery',
          -- NEW (this migration)
          'civil_fines_expense'
        ])
      );
  END IF;
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   -- 1) flag registered and OFF:
--   SELECT flag_key, default_enabled FROM lib.feature_flags
--    WHERE flag_key = 'SAFETY_FINE_GL_POSTING_ENABLED';
--   -- expect exactly one row, default_enabled = false.
--
--   -- 2) role admitted (no rows required — the OWNER designates the account):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'chart_of_accounts_roles_role_check';
--   -- expect 'civil_fines_expense' present among 37 values.
--
--   -- 3) linkage ledger present + locked down:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'accounting.civil_fine_postings'::regclass;                            -- expect t, t
--   SELECT has_table_privilege('ih35_app','accounting.civil_fine_postings','DELETE');   -- expect f
--
--   -- 4) FORCE RLS + no DELETE for the app role:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'safety.civil_fines'::regclass;                    -- expect t, t
--   SELECT has_table_privilege('ih35_app','safety.civil_fines','DELETE');  -- expect f
--
-- OWNER STEP AFTER APPLY (not an agent action):
--   Designate civil_fines_expense -> the Penalties & Fines expense account for each entity via the
--   CoaRoles page. Until then the poster fails closed. Flip SAFETY_FINE_GL_POSTING_ENABLED per entity
--   ONLY at final cutover.
--
-- ROLLBACK (additive; forward-only chain otherwise — void-not-delete, so no data is ever destroyed):
--   BEGIN;
--     -- leave accounting.civil_fine_postings in place (append-only ledger, void-not-delete);
--     -- re-narrow both CHECKs;
--     UPDATE lib.feature_flags SET default_enabled = false
--      WHERE flag_key = 'SAFETY_FINE_GL_POSTING_ENABLED';
--   COMMIT;
