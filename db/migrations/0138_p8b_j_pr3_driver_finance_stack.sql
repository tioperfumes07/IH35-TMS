-- Migration 0138: P8B Block J PR3 — driver_finance stack
-- Creates driver_finance.driver_liabilities, deduction_schedule, driver_advances
-- and restores linked_advance_id FK on cash_advance_requests (deferred in P6-RECONCILE-3).
--
-- Design decisions (Jorge-locked, P6-LOGGER-FIX-AND-DRIVER-FINANCE-DDL cycle):
--   1. Table names match shipped backend code (singular deduction_schedule,
--      driver_advances). Blueprint Part 4.5 naming deferred to Phase 7.
--   2. Column hold_until_period only — held_until_period is a route-side typo
--      to be fixed in P6-LIABILITIES-ROUTES-RENAME follow-up.
--   3. NUMERIC(10,2) per blueprint + accounting standard.
--   4. RLS mirrors 0131 pattern (FOR ALL TO ih35_app, USING + WITH CHECK,
--      app.operating_company_id + lucia bypass).
--   5. touch_updated_at trigger + grants to ih35_app + linked_advance_id FK
--      restoration on cash_advance_requests included inline.

BEGIN;

-- 1) driver_finance.driver_liabilities ----------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.driver_liabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  type text NOT NULL,
  source_description text NOT NULL,
  original_amount numeric(10,2) NOT NULL,
  current_balance numeric(10,2) NOT NULL,
  paid_to_date numeric(10,2) NOT NULL DEFAULT 0,
  requires_acknowledgment boolean NOT NULL DEFAULT true,
  origin text NULL,
  origin_id uuid NULL,
  reference_doc_id uuid NULL,
  status text NOT NULL DEFAULT 'pending_recovery',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_liab_company_driver
  ON driver_finance.driver_liabilities (operating_company_id, driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_liab_company_status
  ON driver_finance.driver_liabilities (operating_company_id, status);

ALTER TABLE driver_finance.driver_liabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_liabilities_company_isolation ON driver_finance.driver_liabilities;
CREATE POLICY driver_liabilities_company_isolation ON driver_finance.driver_liabilities
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

-- 2) driver_finance.deduction_schedule ----------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.deduction_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  liability_id uuid NOT NULL REFERENCES driver_finance.driver_liabilities(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  amount_per_period numeric(10,2) NOT NULL,
  total_periods integer NOT NULL,
  cadence text NOT NULL,
  starts_on date NOT NULL,
  is_held boolean NOT NULL DEFAULT false,
  hold_until_period date NULL,
  hold_reason text NULL,
  held_by_user_id uuid NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deduction_sched_liability
  ON driver_finance.deduction_schedule (liability_id);
CREATE INDEX IF NOT EXISTS idx_deduction_sched_company_driver
  ON driver_finance.deduction_schedule (operating_company_id, driver_id);

ALTER TABLE driver_finance.deduction_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deduction_schedule_company_isolation ON driver_finance.deduction_schedule;
CREATE POLICY deduction_schedule_company_isolation ON driver_finance.deduction_schedule
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

-- 3) driver_finance.driver_advances -------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.driver_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  display_id text NOT NULL,
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  liability_id uuid NOT NULL REFERENCES driver_finance.driver_liabilities(id) ON DELETE RESTRICT,
  amount numeric(10,2) NOT NULL,
  purpose text NOT NULL,
  disbursement_method text NOT NULL,
  disbursement_status text NOT NULL,
  recipient_type text NOT NULL,
  recipient_name text NULL,
  linked_bill_id uuid NULL REFERENCES accounting.bills(id),
  linked_bill_payment_id uuid NULL,
  linked_bank_txn_id uuid NULL,
  disbursement_reference text NULL,
  requires_owner_approval boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  disbursed_at timestamptz NULL,
  status text NOT NULL DEFAULT 'outstanding',
  outstanding_balance numeric(10,2) NOT NULL DEFAULT 0,
  memo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, display_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_adv_company_driver
  ON driver_finance.driver_advances (operating_company_id, driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_adv_company_status
  ON driver_finance.driver_advances (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_driver_adv_liability
  ON driver_finance.driver_advances (liability_id);

ALTER TABLE driver_finance.driver_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS driver_advances_company_isolation ON driver_finance.driver_advances;
CREATE POLICY driver_advances_company_isolation ON driver_finance.driver_advances
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

-- 4) Ensure driver_finance.touch_updated_at() exists + wire to all 3 tables --
CREATE OR REPLACE FUNCTION driver_finance.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_driver_liab_touch ON driver_finance.driver_liabilities;
CREATE TRIGGER trg_driver_liab_touch
  BEFORE UPDATE ON driver_finance.driver_liabilities
  FOR EACH ROW EXECUTE FUNCTION driver_finance.touch_updated_at();

DROP TRIGGER IF EXISTS trg_deduction_sched_touch ON driver_finance.deduction_schedule;
CREATE TRIGGER trg_deduction_sched_touch
  BEFORE UPDATE ON driver_finance.deduction_schedule
  FOR EACH ROW EXECUTE FUNCTION driver_finance.touch_updated_at();

DROP TRIGGER IF EXISTS trg_driver_adv_touch ON driver_finance.driver_advances;
CREATE TRIGGER trg_driver_adv_touch
  BEFORE UPDATE ON driver_finance.driver_advances
  FOR EACH ROW EXECUTE FUNCTION driver_finance.touch_updated_at();

-- 5) Restore linked_advance_id FK on cash_advance_requests --------------------
-- Was deferred in P6-RECONCILE-3 (the patched 0131 left the column as
-- `uuid NULL` without a FK because driver_advances didn't exist yet).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_advance_requests_linked_advance_id_fkey'
  ) THEN
    ALTER TABLE driver_finance.cash_advance_requests
      ADD CONSTRAINT cash_advance_requests_linked_advance_id_fkey
      FOREIGN KEY (linked_advance_id) REFERENCES driver_finance.driver_advances(id);
  END IF;
END $$;

-- 6) Grants to ih35_app -------------------------------------------------------
DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_liabilities TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.deduction_schedule TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_advances TO ih35_app;
  END IF;
END
$$;

COMMIT;
