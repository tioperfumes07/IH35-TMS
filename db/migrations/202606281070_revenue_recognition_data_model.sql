-- RR-MIG / Phase 4 FINANCE-HUB — Revenue Recognition data model (ASC 606), tables only.
-- Built verbatim from Cascade's migration-ready spec docs/specs/REVENUE-RECOGNITION-DATA-MODEL-2026-06-28.md
-- (PR #1582). Pattern mirrors 202606271610_prepaid_expenses_data_model.sql: cents spine, RLS
-- ENABLE+FORCE, soft-delete, audit cols, tenant-scoped by operating_company_id. NO posting code,
-- NO flag flips. customer_uuid/source_load_id are intentional soft refs (parity w/ prepaid vendor_uuid).
-- Idempotent (IF NOT EXISTS). Tier-1 / HOLD.

-- §2 — contracts (ASC 606 steps 1 + 3)
CREATE TABLE IF NOT EXISTS accounting.revenue_contracts (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  contract_number             text,
  customer_uuid               uuid,
  description                 text        NOT NULL,
  source_type                 text        NOT NULL DEFAULT 'standalone'
                                CHECK (source_type IN ('standalone','load','invoice','subscription')),
  source_load_id              uuid,
  source_invoice_id           uuid        REFERENCES accounting.invoices(id),
  transaction_price_cents     bigint      NOT NULL CHECK (transaction_price_cents >= 0),
  currency_code               text        NOT NULL DEFAULT 'USD',
  contract_date               date        NOT NULL,
  start_date                  date        NOT NULL,
  end_date                    date,
  deferred_revenue_account_id uuid        REFERENCES catalogs.accounts(id),
  ar_account_id               uuid        REFERENCES catalogs.accounts(id),
  status                      text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('draft','active','fully_recognized','voided')),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  voided_at                   timestamptz,
  voided_by_user_id           uuid        REFERENCES identity.users(id),
  void_reason                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_contracts_company_number
  ON accounting.revenue_contracts (operating_company_id, contract_number)
  WHERE contract_number IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_revenue_contracts_company_status
  ON accounting.revenue_contracts (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_revenue_contracts_customer
  ON accounting.revenue_contracts (operating_company_id, customer_uuid);

-- §3 — obligations (ASC 606 steps 2 + 4)
CREATE TABLE IF NOT EXISTS accounting.revenue_obligations (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  contract_id                 uuid        NOT NULL REFERENCES accounting.revenue_contracts(id) ON DELETE RESTRICT,
  obligation_number           int         NOT NULL CHECK (obligation_number > 0),
  description                 text        NOT NULL,
  standalone_selling_price_cents bigint   NOT NULL CHECK (standalone_selling_price_cents >= 0),
  allocated_price_cents       bigint      NOT NULL CHECK (allocated_price_cents >= 0),
  recognition_method          text        NOT NULL DEFAULT 'point_in_time'
                                CHECK (recognition_method IN ('point_in_time','over_time_straight_line','over_time_usage')),
  recognition_start_date      date,
  recognition_end_date        date,
  periods                     int         CHECK (periods IS NULL OR periods > 0),
  satisfied_at                timestamptz,
  satisfied_trigger           text        DEFAULT 'manual'
                                CHECK (satisfied_trigger IN ('manual','delivery_pod','invoice_paid')),
  revenue_account_id          uuid        REFERENCES catalogs.accounts(id),
  status                      text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','in_progress','satisfied','voided')),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_obligations_contract_number
  ON accounting.revenue_obligations (contract_id, obligation_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_revenue_obligations_company_contract
  ON accounting.revenue_obligations (operating_company_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_revenue_obligations_pending
  ON accounting.revenue_obligations (operating_company_id, status)
  WHERE status IN ('pending','in_progress') AND is_active = true;

-- §4 — recognition schedule (ASC 606 step 5)
CREATE TABLE IF NOT EXISTS accounting.revenue_recognition_rows (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  contract_id                 uuid        NOT NULL REFERENCES accounting.revenue_contracts(id) ON DELETE RESTRICT,
  obligation_id               uuid        NOT NULL REFERENCES accounting.revenue_obligations(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  period_date                 date        NOT NULL,
  recognized_amount_cents     bigint      NOT NULL CHECK (recognized_amount_cents >= 0),
  remaining_deferred_cents    bigint      NOT NULL DEFAULT 0 CHECK (remaining_deferred_cents >= 0),
  method_snapshot             text        NOT NULL,
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_revenue_recognition_active_period
  ON accounting.revenue_recognition_rows (obligation_id, period_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_revenue_recognition_company_contract
  ON accounting.revenue_recognition_rows (operating_company_id, contract_id);
CREATE INDEX IF NOT EXISTS idx_revenue_recognition_pending
  ON accounting.revenue_recognition_rows (operating_company_id, period_date)
  WHERE posted = false AND is_active = true;

-- §5 — grants + RLS (ENABLE + FORCE) + company-scope policy, per table
GRANT SELECT, INSERT, UPDATE ON accounting.revenue_contracts        TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.revenue_obligations      TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.revenue_recognition_rows TO ih35_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['revenue_contracts','revenue_obligations','revenue_recognition_rows']
  LOOP
    EXECUTE format('ALTER TABLE accounting.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE accounting.%I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON accounting.%I', t || '_company_scope', t);
    EXECUTE format(
      'CREATE POLICY %I ON accounting.%I FOR ALL TO ih35_app '
      || 'USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting(''app.operating_company_id'', true), '''')::uuid) '
      || 'WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting(''app.operating_company_id'', true), '''')::uuid)',
      t || '_company_scope', t);
  END LOOP;
END $$;

-- §6 — feature flags (posting GATED OFF)
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('REVENUE_RECOGNITION_ENABLED',
   'UI-1 Revenue Recognition — ASC 606 contracts, obligations, recognition schedule (read/compute). GL posting OFF.',
   false),
  ('REVENUE_RECOGNITION_POST_ENABLED',
   'Revenue Recognition — post deferral + recognition JEs. Default OFF. GUARD-gated.',
   false)
ON CONFLICT (flag_key) DO NOTHING;
