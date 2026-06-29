-- [HOLD-FOR-JORGE — TIER 1] FIN-22 — Lease ASC 842 LESSOR subledger + posting foundation.
--
-- *** DO NOT MERGE. DO NOT flip LEASE_GL_POSTING_ENABLED. Posting flag DEFAULT OFF. ***
-- Built BUILD-AND-HOLD (§1.4). Owner-locked DEFAULT election = OPERATING (Option A): Trucking (TRK)
-- KEEPS the unit on its books, depreciates it (FIN-21, not here), recognizes RENTAL INCOME each period,
-- and at LEASE END posts the SALE (derecognize cost + accum-deprec, recognize proceeds, gain/loss on
-- disposal) via the EXISTING accounting.fixed_asset_disposals table. Option B SALES-TYPE is retained
-- per-deal (CPA election) — derecognize at commencement + lease receivable + interest income.
-- TRK books the lease (operating_company_id = Trucking). NO derecognition at commencement under operating.
--
-- This migration is data-model + role-registry only. NO posting code, NO GL math. Idempotent
-- (IF NOT EXISTS / DROP ... IF EXISTS), fresh-DB-safe (CI migrates from 0001), RLS ENABLE+FORCE per the
-- accounting.* convention (NULLIF-wrapped current_setting()::uuid + identity.is_lucia_bypass()), explicit
-- GRANTs to ih35_app. void-not-delete (is_active soft-delete + audit cols on every table).

BEGIN;

-- ===========================================================================================
-- §1 — Role registry: ADD the 4 FIN-22 lessor roles to BOTH closed-list CHECK constraints.
-- Each CHECK is rebuilt as a TRUE SUPERSET (every existing value on main after FIN-18 #1644 +
-- the 4 new roles). Resolution is per-opco via accounting.chart_of_accounts_roles
-- (resolveRoleAccountOptional); catalogs.account_role_bindings is the GLOBAL legacy registry — both
-- are widened so neither rejects the new role values.
-- ===========================================================================================

-- 1a. accounting.chart_of_accounts_roles.role — current 12 (through migration 202606151500) + 4 new.
ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role IN (
    -- existing (0223 base + 202606151500 uncategorized_expense)
    'ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
    'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
    'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
    -- FIN-22 lessor roles
    'rental_income','lease_receivable','interest_income','gain_loss_on_disposal'
  ));

-- 1b. catalogs.account_role_bindings.role_key — FIN-18's list (migration 202606290010) + 4 new.
ALTER TABLE catalogs.account_role_bindings DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_check;
ALTER TABLE catalogs.account_role_bindings ADD CONSTRAINT account_role_bindings_role_key_check CHECK (
  role_key = ANY (ARRAY[
    -- existing (pre-FIN-18)
    'ar_clearing', 'ap_clearing', 'cash_dip', 'cash_payroll', 'cash_petty',
    'fuel_expense', 'maintenance_expense', 'driver_payroll_clearing',
    'factor_advances_receivable', 'factor_chargebacks_payable', 'undeposited_funds',
    -- FIN-18 settlement posting roles
    'driver_pay_expense', 'reimbursement_expense',
    'advance_recovery', 'damage_recovery', 'lease_recovery', 'insurance_recovery',
    'fuel_advance_recovery', 'other_recovery',
    -- FIN-22 lessor roles
    'rental_income', 'lease_receivable', 'interest_income', 'gain_loss_on_disposal'
  ])
);

-- ===========================================================================================
-- §2 — accounting.lease_contract — one lessor lease (TRK is lessor/title-holder; TRK books it).
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS accounting.lease_contract (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id         uuid        NOT NULL REFERENCES org.companies(id),         -- TRK books the lease
  lessor_operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),         -- title holder / seller (= TRK)
  lessee_name                  text        NOT NULL,
  lessee_customer_id           uuid        REFERENCES mdata.customers(id),
  display_id                   text,
  election                     text        NOT NULL DEFAULT 'operating'
                                 CHECK (election IN ('operating','sales_type')),
  commencement_date            date        NOT NULL,
  end_date                     date        NOT NULL,
  payment_amount_cents         bigint      NOT NULL CHECK (payment_amount_cents >= 0),    -- per-period rental
  payment_frequency            text        NOT NULL DEFAULT 'monthly'
                                 CHECK (payment_frequency IN ('monthly','quarterly','annual')),
  number_of_periods            int         NOT NULL CHECK (number_of_periods > 0),
  total_lease_payments_cents   bigint      NOT NULL CHECK (total_lease_payments_cents >= 0),
  discount_rate_bps            int         CHECK (discount_rate_bps IS NULL OR discount_rate_bps >= 0),
  residual_value_cents         bigint      NOT NULL DEFAULT 0 CHECK (residual_value_cents >= 0),
  contract_instance_id         uuid        REFERENCES legal.contract_instances(id),       -- nullable legal handoff link
  status                       text        NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft','active','ended','cancelled')),
  commencement_je_id           uuid        REFERENCES accounting.journal_entries(id),     -- sales-type derecognition JE
  is_active                    boolean     NOT NULL DEFAULT true,
  deleted_at                   timestamptz,
  voided_at                    timestamptz,
  void_reason                  text,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  created_by_user_id           uuid        REFERENCES identity.users(id),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id           uuid        REFERENCES identity.users(id),
  CONSTRAINT lease_contract_dates_ordered CHECK (end_date >= commencement_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_contract_company_display
  ON accounting.lease_contract (operating_company_id, display_id)
  WHERE display_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_lease_contract_company_status
  ON accounting.lease_contract (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_lease_contract_instance
  ON accounting.lease_contract (contract_instance_id) WHERE contract_instance_id IS NOT NULL;

-- ===========================================================================================
-- §3 — accounting.lease_asset_line — the leased asset(s) on a contract (FK fixed_assets + units).
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS accounting.lease_asset_line (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  lease_contract_id     uuid        NOT NULL REFERENCES accounting.lease_contract(id) ON DELETE RESTRICT,
  fixed_asset_id        uuid        NOT NULL REFERENCES accounting.fixed_assets(id) ON DELETE RESTRICT,
  unit_uuid             uuid        REFERENCES mdata.units(id),
  allocated_cost_cents  bigint      CHECK (allocated_cost_cents IS NULL OR allocated_cost_cents >= 0),
  is_active             boolean     NOT NULL DEFAULT true,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid        REFERENCES identity.users(id),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id    uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_asset_line_contract_asset
  ON accounting.lease_asset_line (lease_contract_id, fixed_asset_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lease_asset_line_company_contract
  ON accounting.lease_asset_line (operating_company_id, lease_contract_id);
CREATE INDEX IF NOT EXISTS idx_lease_asset_line_asset
  ON accounting.lease_asset_line (fixed_asset_id);

-- ===========================================================================================
-- §4 — accounting.lease_schedule_period — generated period rows (ties to contract totals).
-- operating: rental_income_cents per period. sales_type: payment = principal + interest, with a
-- running receivable balance (effective-interest amortization computed app-side).
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS accounting.lease_schedule_period (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  lease_contract_id           uuid        NOT NULL REFERENCES accounting.lease_contract(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  period_date                 date        NOT NULL,
  payment_cents               bigint      NOT NULL CHECK (payment_cents >= 0),
  rental_income_cents         bigint      NOT NULL DEFAULT 0 CHECK (rental_income_cents >= 0),   -- operating
  interest_cents              bigint      NOT NULL DEFAULT 0 CHECK (interest_cents >= 0),        -- sales-type
  principal_cents             bigint      NOT NULL DEFAULT 0 CHECK (principal_cents >= 0),       -- sales-type
  receivable_balance_cents    bigint      NOT NULL DEFAULT 0 CHECK (receivable_balance_cents >= 0),
  posted                      boolean     NOT NULL DEFAULT false,
  posted_journal_entry_id     uuid        REFERENCES accounting.journal_entries(id),
  posted_at                   timestamptz,
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_schedule_period_active
  ON accounting.lease_schedule_period (lease_contract_id, period_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lease_schedule_period_company_contract
  ON accounting.lease_schedule_period (operating_company_id, lease_contract_id);
CREATE INDEX IF NOT EXISTS idx_lease_schedule_period_pending
  ON accounting.lease_schedule_period (operating_company_id, period_date)
  WHERE posted = false AND is_active = true;

-- ===========================================================================================
-- §5 — accounting.lease_classification — the per-contract ASC 842 classification decision.
-- ===========================================================================================
CREATE TABLE IF NOT EXISTS accounting.lease_classification (
  id                                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id                  uuid        NOT NULL REFERENCES org.companies(id),
  lease_contract_id                     uuid        NOT NULL REFERENCES accounting.lease_contract(id) ON DELETE RESTRICT,
  election                              text        NOT NULL DEFAULT 'operating'
                                          CHECK (election IN ('operating','sales_type')),
  classification_basis                  text,
  transfers_ownership                   boolean     NOT NULL DEFAULT false,
  purchase_option_reasonably_certain    boolean     NOT NULL DEFAULT false,
  lease_term_major_part_of_life         boolean     NOT NULL DEFAULT false,
  pv_substantially_all_fair_value       boolean     NOT NULL DEFAULT false,
  specialized_asset                     boolean     NOT NULL DEFAULT false,
  determined_by_user_id                 uuid        REFERENCES identity.users(id),
  determined_at                         timestamptz,
  notes                                 text,
  is_active                             boolean     NOT NULL DEFAULT true,
  deleted_at                            timestamptz,
  created_at                            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id                    uuid        REFERENCES identity.users(id),
  updated_at                            timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id                    uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lease_classification_active
  ON accounting.lease_classification (lease_contract_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lease_classification_company
  ON accounting.lease_classification (operating_company_id, lease_contract_id);

-- ===========================================================================================
-- §6 — link the END-OF-TERM SALE (operating) back to its lease: reuse accounting.fixed_asset_disposals,
-- add a nullable FK to the lease contract (do NOT invent an end_of_term_disposal table).
-- ===========================================================================================
ALTER TABLE accounting.fixed_asset_disposals
  ADD COLUMN IF NOT EXISTS lease_contract_id uuid REFERENCES accounting.lease_contract(id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_disposals_lease
  ON accounting.fixed_asset_disposals (lease_contract_id) WHERE lease_contract_id IS NOT NULL;

-- ===========================================================================================
-- §7 — GRANTs + RLS (ENABLE + FORCE) + company-scope policy, per table (literal ALTER statements
-- so the static rls-migration-scan + verify-rls-uuid-cast-nullif recognize them).
-- ===========================================================================================
GRANT SELECT, INSERT, UPDATE ON accounting.lease_contract         TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.lease_asset_line        TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.lease_schedule_period   TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.lease_classification    TO ih35_app;

ALTER TABLE accounting.lease_contract ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.lease_contract FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lease_contract_company_scope ON accounting.lease_contract;
CREATE POLICY lease_contract_company_scope ON accounting.lease_contract FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE accounting.lease_asset_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.lease_asset_line FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lease_asset_line_company_scope ON accounting.lease_asset_line;
CREATE POLICY lease_asset_line_company_scope ON accounting.lease_asset_line FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE accounting.lease_schedule_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.lease_schedule_period FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lease_schedule_period_company_scope ON accounting.lease_schedule_period;
CREATE POLICY lease_schedule_period_company_scope ON accounting.lease_schedule_period FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE accounting.lease_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.lease_classification FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lease_classification_company_scope ON accounting.lease_classification;
CREATE POLICY lease_classification_company_scope ON accounting.lease_classification FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- ===========================================================================================
-- §8 — Seed the 4 lessor role accounts + per-opco chart_of_accounts_roles mapping for TRK ONLY.
-- TRK is the lessor/title-holder and the ONLY entity that books lessor leases. Resolve TRK BY CODE
-- (never hardcode the uuid). Accounts are TRK-scoped (catalogs.accounts is per-entity post-AF1:
-- operating_company_id NOT NULL + composite unique (operating_company_id, account_number)). Idempotent
-- (WHERE NOT EXISTS by name + ON CONFLICT on the partial role unique index). Reviewed/owner-gated; the
-- posting flag is OFF so these mappings move no money until Jorge enables FIN-22.
-- ===========================================================================================
DO $$
DECLARE
  v_trk uuid;
  v_has_opco boolean;
BEGIN
  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' LIMIT 1;
  -- Only seed when TRK exists AND catalogs.accounts has the per-entity column (post-AF1 / live).
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='catalogs' AND table_name='accounts' AND column_name='operating_company_id'
  ) INTO v_has_opco;

  IF v_trk IS NOT NULL AND v_has_opco THEN
    -- 1) TRK-scoped GL accounts for each lessor role (create only if absent for TRK, by name).
    INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, is_postable)
    SELECT v_trk, vals.num, vals.nm, vals.typ, true
    FROM (VALUES
      ('42000-LEASE', 'Equipment Rental Income (Lessor)',   'Income'),
      ('13000-LEASE', 'Lease Receivable (Sales-Type)',       'Asset'),
      ('42500-LEASE', 'Interest Income — Leases',            'OtherIncome'),
      ('79000-LEASE', 'Gain/Loss on Asset Disposal',         'OtherIncome')
    ) AS vals(num, nm, typ)
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogs.accounts a
      WHERE a.operating_company_id = v_trk AND a.account_name = vals.nm
    );

    -- 2) Map TRK's per-opco role -> that account in accounting.chart_of_accounts_roles.
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    SELECT v_trk, m.role, a.id, true
    FROM (VALUES
      ('rental_income',          'Equipment Rental Income (Lessor)'),
      ('lease_receivable',       'Lease Receivable (Sales-Type)'),
      ('interest_income',        'Interest Income — Leases'),
      ('gain_loss_on_disposal',  'Gain/Loss on Asset Disposal')
    ) AS m(role, acct_name)
    JOIN catalogs.accounts a
      ON a.operating_company_id = v_trk AND a.account_name = m.acct_name
    ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;
  END IF;
END
$$;

-- ===========================================================================================
-- §9 — Money flag — DEFAULT OFF. With it OFF the FIN-22 poster is a NO-OP (zero JEs / financial rows).
-- ===========================================================================================
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'LEASE_GL_POSTING_ENABLED',
  'FIN-22: post lessor leases (ASC 842) to the GL. Operating (default): periodic rental income + end-of-term sale via fixed_asset_disposals (NO derecognition at commencement). Sales-type (per-deal): derecognition at commencement + lease receivable + interest income. DEFAULT OFF — owner-gated.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
