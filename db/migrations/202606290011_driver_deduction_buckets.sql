-- FIN-18 — Per-entity, per-driver BUCKETED deduction ledger + history + driver pay settings.
-- A SEPARATE running balance per deduction bucket (advance, damage, lease, insurance, …extensible).
-- Finite buckets (advance, damage) draw to zero; recurring buckets (lease, insurance) track cumulative
-- obligation + applied-to-date ("payment N of M"). NOT one combined balance. Idempotent + fresh-DB-safe.
BEGIN;

-- ---------------------------------------------------------------------------------------------
-- Bucket ledger — one running balance per (operating_company_id, driver_id, bucket_type).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.driver_deduction_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  bucket_type text NOT NULL,                       -- extensible: advance, damage, lease, insurance, fuel_advance, other, …
  is_recurring boolean NOT NULL DEFAULT false,     -- finite (advance/damage) vs recurring (lease/insurance)
  total_obligation_cents bigint NULL CHECK (total_obligation_cents IS NULL OR total_obligation_cents >= 0),
  installments_total integer NULL CHECK (installments_total IS NULL OR installments_total > 0),
  installments_applied integer NOT NULL DEFAULT 0 CHECK (installments_applied >= 0),
  charged_to_date_cents bigint NOT NULL DEFAULT 0 CHECK (charged_to_date_cents >= 0),
  deducted_to_date_cents bigint NOT NULL DEFAULT 0 CHECK (deducted_to_date_cents >= 0),
  remaining_balance_cents bigint NOT NULL DEFAULT 0 CHECK (remaining_balance_cents >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT driver_deduction_buckets_balance_chk CHECK (deducted_to_date_cents <= charged_to_date_cents)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_deduction_buckets_natural
  ON driver_finance.driver_deduction_buckets (operating_company_id, driver_id, bucket_type);

ALTER TABLE driver_finance.driver_deduction_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_deduction_buckets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_deduction_buckets_tenant_scope ON driver_finance.driver_deduction_buckets;
CREATE POLICY driver_deduction_buckets_tenant_scope ON driver_finance.driver_deduction_buckets
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);
GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_deduction_buckets TO ih35_app;

-- ---------------------------------------------------------------------------------------------
-- Append-only bucket HISTORY: every charge / application / reversal / adjustment with running balance.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.driver_deduction_bucket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bucket_id uuid NOT NULL REFERENCES driver_finance.driver_deduction_buckets(id),
  event_type text NOT NULL CHECK (event_type IN ('charge', 'application', 'reversal', 'adjustment')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  balance_after_cents bigint NOT NULL CHECK (balance_after_cents >= 0),
  source_expense_id uuid NULL REFERENCES accounting.expenses(id),
  settlement_id uuid NULL REFERENCES driver_finance.driver_settlements(id),
  deduction_id uuid NULL,                          -- FK added in 202606290012 after the column exists
  reason text NULL,
  actor_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ddbe_bucket ON driver_finance.driver_deduction_bucket_events (bucket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ddbe_settlement ON driver_finance.driver_deduction_bucket_events (settlement_id) WHERE settlement_id IS NOT NULL;

ALTER TABLE driver_finance.driver_deduction_bucket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_deduction_bucket_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_deduction_bucket_events_tenant_scope ON driver_finance.driver_deduction_bucket_events;
CREATE POLICY driver_deduction_bucket_events_tenant_scope ON driver_finance.driver_deduction_bucket_events
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);
GRANT SELECT, INSERT ON driver_finance.driver_deduction_bucket_events TO ih35_app;

-- ---------------------------------------------------------------------------------------------
-- Per-driver pay settings: net-pay floor OVERRIDE (NULL => entity default) + worker classification.
-- worker_class 'w2' ADDITIONALLY enforces the FLSA minimum-wage floor (stricter of the two applies).
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.driver_pay_settings (
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  net_pay_floor_pct numeric(5,4) NULL
    CHECK (net_pay_floor_pct IS NULL OR (net_pay_floor_pct >= 0 AND net_pay_floor_pct <= 1)),
  worker_class text NOT NULL DEFAULT '1099' CHECK (worker_class IN ('1099', 'w2')),
  flsa_min_wage_cents_per_hour bigint NULL CHECK (flsa_min_wage_cents_per_hour IS NULL OR flsa_min_wage_cents_per_hour >= 0),
  created_by_user_id uuid NULL REFERENCES identity.users(id),
  updated_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, driver_id)
);

ALTER TABLE driver_finance.driver_pay_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_pay_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_pay_settings_tenant_scope ON driver_finance.driver_pay_settings;
CREATE POLICY driver_pay_settings_tenant_scope ON driver_finance.driver_pay_settings
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
);
GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_pay_settings TO ih35_app;

COMMIT;
