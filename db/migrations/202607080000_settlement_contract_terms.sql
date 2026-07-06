-- [HOLD-FOR-JORGE — TIER 1] Settlement contract-terms computation engine (driver hire-contract bonuses/deductions)
--
-- *** DO NOT RUN ON PROD. DO NOT MERGE. DO NOT FLIP A FLAG. *** Tier-1 financial (driver_finance /
-- accounting / mdata / safety). BUILD-AND-HOLD behind an OFF, per-entity flag. Runs ONLY on a Neon branch
-- executed by Jorge / GUARD, then ledger-backfilled so prod db:migrate skips it. Registered in
-- .held-migrations.json. Posts NOTHING at migrate time; seeds one feature flag OFF.
--
-- WHY (Jorge LOCKED 2026-07-05, driver hire-contract spec + finance-build-directive): the signed driver
-- HIRE CONTRACT states five money terms that the canonical settlement engine
-- (driver_finance.driver_settlements + driver_finance.driver_settlement_deductions) does NOT yet compute:
--   1. MPG fuel-efficiency bonus +$35 / settlement when trip MPG > 7.0 (a positive pay line).
--   2. Referral bonus $200 when a referred driver has worked >= 30 days (paid to the REFERRER).
--   3. Late-delivery pass-through deduction — when a late delivery is the DRIVER'S FAULT, deduct what the
--      CUSTOMER charged us back for that load (pass-through; carries load_id DIRECTLY).
--   4. All-fines deduction — from BOTH canonical fine tables: EXTERNAL/regulatory (safety.civil_fines:
--      customs / police / DOT) AND INTERNAL company fines (safety.internal_fines: cleanliness / conduct /
--      equipment) attributable to the driver -> a deduction linked to the fine record + load + driver.
--   5. Immediate reimbursement — driver out-of-pocket tolls/fuel = a REIMBURSEMENT (pay-out, NOT a
--      deduction) that can be paid IMMEDIATELY (not only at settlement close).
--
-- This migration is ADDITIVE + IDEMPOTENT + FRESH-DB-SAFE only. It does NOT compute or post anything —
-- the computations live in apps/backend/src/driver-finance/settlement-contract-terms.service.ts, gated by
-- the SETTLEMENT_CONTRACT_TERMS_ENABLED flag seeded OFF here. No new GL math: positive lines flow through
-- the EXISTING settlement poster's driver-pay/reimbursement legs; deductions flow through the EXISTING
-- bucketed deduction applier + poster. Reuse only.
--
-- SCHEMA TOUCHES (all additive, all IF NOT EXISTS):
--   * mdata.drivers                         — referral link + reward-paid provenance (columns).
--   * mdata.loads                           — customer chargeback AMOUNT + driver-fault flag (columns).
--   * safety.civil_fines                          — reverse link to the driver deduction it produced (column).
--   * safety.internal_fines                        — READ approved rows + UPDATE to converted_to_liability
--                                             (existing columns, migration 0050 — NO DDL here; grant only).
--   * driver_finance.driver_reimbursements  — NEW table (immediate-pay out-of-pocket claims).
--   * driver_finance.settlement_contract_lines — NEW table (provenance/connectivity backbone: each computed
--                                             line -> its source record + settlement + created line/deduction).
--   * driver_finance.settlement_contract_terms_config — NEW table (per-entity EDITABLE amounts; locked defaults).
--   * lib.feature_flags                     — seed SETTLEMENT_CONTRACT_TERMS_ENABLED (default OFF).
--
-- CROSS-PR RECONCILE (vs #2152 property-tax 202607080310): this migration does NOT touch the CoA
-- role-CHECK constraints (accounting.chart_of_accounts_roles_role_check / catalogs.account_role_bindings_role_key_check).
-- It adds ZERO role values and seeds ZERO chart_of_accounts_roles rows. #2152's 202607080310 rebuilds
-- those two CHECKs as a TRUE SUPERSET (main's 22 roles + 2 property-tax). Because this migration widens
-- neither CHECK nor seeds any role, the two held migrations compose cleanly in EITHER apply order — no
-- collision. (Verified 2026-07-05 vs origin/main 202607013000, the last widener.)

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1) mdata.drivers — referral link + reward-paid provenance (idempotent ADD COLUMN + guarded FKs).
--    referred_by_driver_id     = the REFERRER (the driver who referred THIS driver).
--    referral_reward_paid_at   = when the $200 referral reward was paid (idempotency stamp; pay ONCE).
--    referral_reward_settlement_id = the referrer's settlement the reward was paid on (reverse drill).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('mdata.drivers') IS NOT NULL THEN
    ALTER TABLE mdata.drivers
      ADD COLUMN IF NOT EXISTS referred_by_driver_id uuid,
      ADD COLUMN IF NOT EXISTS referral_source text,
      ADD COLUMN IF NOT EXISTS referral_reward_paid_at timestamptz,
      ADD COLUMN IF NOT EXISTS referral_reward_settlement_id uuid;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'drivers_referred_by_driver_id_fkey'
        AND conrelid = 'mdata.drivers'::regclass
    ) THEN
      ALTER TABLE mdata.drivers
        ADD CONSTRAINT drivers_referred_by_driver_id_fkey
        FOREIGN KEY (referred_by_driver_id) REFERENCES mdata.drivers(id);
    END IF;

    CREATE INDEX IF NOT EXISTS idx_drivers_referred_by
      ON mdata.drivers (referred_by_driver_id) WHERE referred_by_driver_id IS NOT NULL;
    -- Partial index over drivers whose referrer reward is still owed (the compute path scans this).
    CREATE INDEX IF NOT EXISTS idx_drivers_referral_reward_unpaid
      ON mdata.drivers (referred_by_driver_id)
      WHERE referred_by_driver_id IS NOT NULL AND referral_reward_paid_at IS NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2) mdata.loads — customer chargeback AMOUNT + DRIVER-FAULT flag.
--    customer_chargeback_requested (bool) + customer_chargeback_reason (text) ALREADY EXIST (migration 0110).
--    These add the missing pass-through inputs: the amount the customer charged us back, and whether the
--    late delivery was the driver's fault (only THEN is it passed through to the driver — decision C).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    ALTER TABLE mdata.loads
      ADD COLUMN IF NOT EXISTS customer_chargeback_amount_cents bigint,
      ADD COLUMN IF NOT EXISTS customer_chargeback_driver_fault boolean;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'loads_customer_chargeback_amount_nonneg'
        AND conrelid = 'mdata.loads'::regclass
    ) THEN
      ALTER TABLE mdata.loads
        ADD CONSTRAINT loads_customer_chargeback_amount_nonneg
        CHECK (customer_chargeback_amount_cents IS NULL OR customer_chargeback_amount_cents >= 0);
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3) safety.civil_fines — reverse link to the driver deduction it produced (forward = deduction.load_id/reason;
--    reverse = fine.driver_settlement_deduction_id). Also the idempotency guard: a fine that already has a
--    deduction is never charged twice.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('safety.civil_fines') IS NOT NULL THEN
    ALTER TABLE safety.civil_fines
      ADD COLUMN IF NOT EXISTS driver_settlement_deduction_id uuid;

    IF to_regclass('driver_finance.driver_settlement_deductions') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fines_driver_settlement_deduction_id_fkey'
           AND conrelid = 'safety.civil_fines'::regclass
       ) THEN
      ALTER TABLE safety.civil_fines
        ADD CONSTRAINT fines_driver_settlement_deduction_id_fkey
        FOREIGN KEY (driver_settlement_deduction_id)
        REFERENCES driver_finance.driver_settlement_deductions(id);
    END IF;

    CREATE INDEX IF NOT EXISTS idx_fines_driver_deduction
      ON safety.civil_fines (driver_settlement_deduction_id) WHERE driver_settlement_deduction_id IS NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4) driver_finance.driver_reimbursements — out-of-pocket toll/fuel claims (item 5).
--    A REIMBURSEMENT is money the COMPANY owes the DRIVER (pay-out), the OPPOSITE of a cash advance (a
--    receivable). pay_mode='immediate' pays now (reuses postSourceTransaction('driver_reimbursement'),
--    OFF-flag-gated) WITHOUT waiting for a settlement; pay_mode='settlement' rides the next close as a
--    reimbursement line. Never DELETE — status 'void' (void-not-delete).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_finance.driver_reimbursements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  load_id uuid NULL REFERENCES mdata.loads(id),
  reimbursement_type text NOT NULL CHECK (reimbursement_type IN ('toll', 'fuel', 'scale', 'parking', 'lumper', 'other')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL,
  pay_mode text NOT NULL DEFAULT 'settlement' CHECK (pay_mode IN ('immediate', 'settlement')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'settled', 'void')),
  posting_date date NULL,
  paid_at timestamptz NULL,
  journal_entry_id uuid NULL,
  applied_to_settlement_id uuid NULL REFERENCES driver_finance.driver_settlements(id),
  settlement_line_id uuid NULL REFERENCES driver_finance.settlement_lines(id),
  evidence_doc_id uuid NULL,
  voided_at timestamptz NULL,
  void_reason text NULL,
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_reimbursements_driver_status
  ON driver_finance.driver_reimbursements (operating_company_id, driver_id, status);
CREATE INDEX IF NOT EXISTS idx_driver_reimbursements_load
  ON driver_finance.driver_reimbursements (load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_driver_reimbursements_settlement
  ON driver_finance.driver_reimbursements (applied_to_settlement_id) WHERE applied_to_settlement_id IS NOT NULL;

ALTER TABLE driver_finance.driver_reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_reimbursements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_reimbursements_tenant_scope ON driver_finance.driver_reimbursements;
CREATE POLICY driver_reimbursements_tenant_scope ON driver_finance.driver_reimbursements
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5) driver_finance.settlement_contract_lines — the CONNECTIVITY BACKBONE (Law of the Land §11).
--    settlement_lines is thin (no load_id, no source ref beyond source_driver_bill_id) and
--    driver_settlement_deductions carries load_id but not the full provenance. This table ties EVERY
--    computed contract line to: the settlement, driver, load, the SOURCE record (fuel txn / referred
--    driver / load chargeback / fine / reimbursement), and the created settlement_line OR deduction —
--    reachable forward AND reverse. Also the idempotency ledger (unique per settlement+kind+source).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_finance.settlement_contract_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  settlement_id uuid NOT NULL REFERENCES driver_finance.driver_settlements(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  load_id uuid NULL REFERENCES mdata.loads(id),
  line_kind text NOT NULL CHECK (line_kind IN (
    'mpg_bonus',
    'referral_bonus',
    'late_delivery_passthrough',
    'fine_passthrough',
    'reimbursement'
  )),
  direction text NOT NULL CHECK (direction IN ('pay', 'deduction')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  source_table text NULL,
  source_id uuid NULL,
  referred_driver_id uuid NULL REFERENCES mdata.drivers(id),
  settlement_line_id uuid NULL REFERENCES driver_finance.settlement_lines(id),
  deduction_id uuid NULL REFERENCES driver_finance.driver_settlement_deductions(id),
  computed_basis jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency: at most ONE contract line per (settlement, kind, source). For singletons (mpg_bonus) the
-- source_id is the settlement id itself; for per-source kinds (referral/passthrough/fine/reimbursement)
-- it is the source row id. COALESCE the source to the settlement so the singleton case is covered too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_contract_lines_natural
  ON driver_finance.settlement_contract_lines (settlement_id, line_kind, COALESCE(source_id, settlement_id));
CREATE INDEX IF NOT EXISTS idx_settlement_contract_lines_settlement
  ON driver_finance.settlement_contract_lines (settlement_id);
CREATE INDEX IF NOT EXISTS idx_settlement_contract_lines_load
  ON driver_finance.settlement_contract_lines (load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlement_contract_lines_deduction
  ON driver_finance.settlement_contract_lines (deduction_id) WHERE deduction_id IS NOT NULL;

ALTER TABLE driver_finance.settlement_contract_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.settlement_contract_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_contract_lines_tenant_scope ON driver_finance.settlement_contract_lines;
CREATE POLICY settlement_contract_lines_tenant_scope ON driver_finance.settlement_contract_lines
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 6) driver_finance.settlement_contract_terms_config — per-entity EDITABLE amounts (locked defaults).
--    Contract locks MPG > 7.0 / +$35, referral $200 / >= 30 days — stored as owner-editable per-entity
--    config, NOT hardcoded. The resolver falls back to these DEFAULTs when no row exists (so a fresh entity
--    behaves per the locked contract without a seed).
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_finance.settlement_contract_terms_config (
  operating_company_id uuid PRIMARY KEY REFERENCES org.companies(id),
  mpg_bonus_threshold numeric(6, 3) NOT NULL DEFAULT 7.000 CHECK (mpg_bonus_threshold >= 0),
  mpg_bonus_cents bigint NOT NULL DEFAULT 3500 CHECK (mpg_bonus_cents >= 0),
  referral_reward_cents bigint NOT NULL DEFAULT 20000 CHECK (referral_reward_cents >= 0),
  referral_min_days integer NOT NULL DEFAULT 30 CHECK (referral_min_days >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_finance.settlement_contract_terms_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.settlement_contract_terms_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settlement_contract_terms_config_tenant_scope ON driver_finance.settlement_contract_terms_config;
CREATE POLICY settlement_contract_terms_config_tenant_scope ON driver_finance.settlement_contract_terms_config
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 7) GRANTS (Standing Order #16 / migration 0065 pattern) — self-contained for the new tables + the
--    ALTERed tables (table-level grant covers the new columns). driver_finance is already in the 0065
--    schema array, but we grant explicitly so a fresh-DB replay never 500s on a missing grant.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_reimbursements TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.settlement_contract_lines TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.settlement_contract_terms_config TO ih35_app;
    IF to_regclass('mdata.drivers') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON mdata.drivers TO ih35_app;
    END IF;
    IF to_regclass('mdata.loads') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON mdata.loads TO ih35_app;
    END IF;
    IF to_regclass('safety.civil_fines') IS NOT NULL THEN
      GRANT SELECT, INSERT, UPDATE ON safety.civil_fines TO ih35_app;
    END IF;
    -- INTERNAL fines: the contract-terms engine SELECTs approved rows and UPDATEs them to
    -- status='converted_to_liability' (+ driver_liability_id). No DDL on this table (columns already
    -- exist, migration 0050); grant idempotently so a fresh-DB replay never 500s at runtime.
    IF to_regclass('safety.internal_fines') IS NOT NULL THEN
      GRANT SELECT, UPDATE ON safety.internal_fines TO ih35_app;
    END IF;
    IF to_regclass('catalogs.internal_fine_reasons') IS NOT NULL THEN
      GRANT SELECT ON catalogs.internal_fine_reasons TO ih35_app;
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 8) FEATURE FLAG — SETTLEMENT_CONTRACT_TERMS_ENABLED, DEFAULT OFF, per-entity-only (enrolled in the
--    backend PER_ENTITY_ONLY_FLAG_KEYS set). Seed idempotently; NEVER enable here. Owner (Jorge) flips
--    per entity, TRANSP first, after review.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'SETTLEMENT_CONTRACT_TERMS_ENABLED',
      'Compute the driver hire-contract bonuses/deductions at settlement close (MPG +$35, referral $200, late-delivery pass-through, driver fines, reimbursements). Per-entity-only; default OFF. Money-affecting -> Jorge flips per entity.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

COMMIT;
