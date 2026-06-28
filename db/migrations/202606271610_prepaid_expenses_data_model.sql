-- UI-1 COMPLETE-BUILD — Prepaid Expenses data model
-- QBO/NetSuite parity: prepaid asset header + monthly amortization schedule.
-- GL posting (Dr Prepaid Asset / Cr Cash on purchase; Dr Expense / Cr Prepaid per period)
-- is GATED behind PREPAID_EXPENSES_POST_ENABLED flag (default OFF).
-- Balanced-JE preview always returned; posting refused until flag ON (fail-loud).
-- Same gating pattern as EXPENSE_GL_POSTING_FLAG_KEY / CHAIN-03.
-- Idempotent. Cents spine. RLS ENABLE+FORCE. Soft-delete via is_active.

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.prepaid_assets (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id    uuid        NOT NULL REFERENCES org.companies(id),
  asset_number            text,
  description             text        NOT NULL,
  vendor_uuid             uuid,
  purchase_date           date        NOT NULL,
  start_date              date        NOT NULL,
  end_date                date        NOT NULL,
  total_amount_cents      bigint      NOT NULL CHECK (total_amount_cents > 0),
  periods                 int         NOT NULL CHECK (periods > 0),
  period_amount_cents     bigint      NOT NULL CHECK (period_amount_cents > 0),
  remainder_cents         bigint      NOT NULL DEFAULT 0,
  asset_account_id        uuid        REFERENCES catalogs.accounts(id),
  expense_account_id      uuid        REFERENCES catalogs.accounts(id),
  payment_account_id      uuid        REFERENCES catalogs.accounts(id),
  purchase_je_id          uuid        REFERENCES accounting.journal_entries(id),
  posting_status          text        NOT NULL DEFAULT 'unposted'
                            CHECK (posting_status IN ('unposted','posted','reversed')),
  posted_at               timestamptz,
  status                  text        NOT NULL DEFAULT 'active'
                            CHECK (status IN ('active','fully_amortized','voided')),
  voided_at               timestamptz,
  voided_by_user_id       uuid        REFERENCES identity.users(id),
  void_reason             text,
  is_active               boolean     NOT NULL DEFAULT true,
  deleted_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by_user_id      uuid        REFERENCES identity.users(id),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id      uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prepaid_assets_company_number
  ON accounting.prepaid_assets (operating_company_id, asset_number)
  WHERE asset_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prepaid_assets_company_status
  ON accounting.prepaid_assets (operating_company_id, status);

CREATE TABLE IF NOT EXISTS accounting.prepaid_amortization_rows (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id      uuid        NOT NULL REFERENCES org.companies(id),
  asset_id                  uuid        NOT NULL REFERENCES accounting.prepaid_assets(id) ON DELETE RESTRICT,
  period_number             int         NOT NULL CHECK (period_number > 0),
  period_date               date        NOT NULL,
  amount_cents              bigint      NOT NULL CHECK (amount_cents > 0),
  remaining_balance_cents   bigint      NOT NULL DEFAULT 0,
  posted                    boolean     NOT NULL DEFAULT false,
  posted_journal_entry_id   uuid        REFERENCES accounting.journal_entries(id),
  posted_at                 timestamptz,
  is_active                 boolean     NOT NULL DEFAULT true,
  deleted_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by_user_id        uuid        REFERENCES identity.users(id),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id        uuid        REFERENCES identity.users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_prepaid_amort_active_period
  ON accounting.prepaid_amortization_rows (asset_id, period_number)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_prepaid_amort_company_asset
  ON accounting.prepaid_amortization_rows (operating_company_id, asset_id);

CREATE INDEX IF NOT EXISTS idx_prepaid_amort_pending
  ON accounting.prepaid_amortization_rows (operating_company_id, period_date)
  WHERE posted = false;

GRANT SELECT, INSERT, UPDATE ON accounting.prepaid_assets TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.prepaid_amortization_rows TO ih35_app;

ALTER TABLE accounting.prepaid_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.prepaid_assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prepaid_assets_company_scope ON accounting.prepaid_assets;
CREATE POLICY prepaid_assets_company_scope ON accounting.prepaid_assets FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

ALTER TABLE accounting.prepaid_amortization_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.prepaid_amortization_rows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prepaid_amort_rows_company_scope ON accounting.prepaid_amortization_rows;
CREATE POLICY prepaid_amort_rows_company_scope ON accounting.prepaid_amortization_rows FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('PREPAID_EXPENSES_ENABLED',
   'UI-1 Prepaid Expenses — list + create assets, view amortization schedule. GL posting OFF.',
   false),
  ('PREPAID_EXPENSES_POST_ENABLED',
   'UI-1 Prepaid Expenses — post purchase JE + monthly amortization JEs. Default OFF. GUARD-gated.',
   false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
