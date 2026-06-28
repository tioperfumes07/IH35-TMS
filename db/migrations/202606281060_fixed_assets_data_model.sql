-- FA-MIG / Phase 4 FINANCE-HUB — Fixed Assets data model (ASC 360), tables only.
-- Built verbatim from Cascade's migration-ready spec docs/specs/FIXED-ASSETS-DATA-MODEL-2026-06-28.md
-- (PR #1581). Pattern mirrors 202606271610_prepaid_expenses_data_model.sql: cents spine, RLS
-- ENABLE+FORCE, soft-delete, audit cols, tenant-scoped by operating_company_id. NO posting code,
-- NO flag flips. Seeding of fixed_asset_classes is deferred to app-side (§10.4) — not seeded here
-- to avoid hardcoding per-company / GL-account ids. Idempotent (IF NOT EXISTS). Tier-1 / HOLD.

-- §2 — class catalog
CREATE TABLE IF NOT EXISTS accounting.fixed_asset_classes (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  class_code                  text        NOT NULL,
  class_name                  text        NOT NULL,
  is_depreciable              boolean     NOT NULL DEFAULT true,
  default_method              text        NOT NULL DEFAULT 'straight_line'
                                CHECK (default_method IN ('straight_line','declining_balance','units_of_production')),
  default_useful_life_months  int         NOT NULL DEFAULT 60 CHECK (default_useful_life_months > 0),
  default_asset_account_id    uuid        REFERENCES catalogs.accounts(id),
  default_accum_depr_account_id uuid      REFERENCES catalogs.accounts(id),
  default_depr_expense_account_id uuid    REFERENCES catalogs.accounts(id),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_asset_classes_company_code
  ON accounting.fixed_asset_classes (operating_company_id, class_code) WHERE is_active = true;

-- §3 — asset register
CREATE TABLE IF NOT EXISTS accounting.fixed_assets (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  owner_operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  asset_number                text,
  name                        text        NOT NULL,
  class_id                    uuid        NOT NULL REFERENCES accounting.fixed_asset_classes(id),
  unit_uuid                   uuid        REFERENCES mdata.units(id),
  vin_serial                  text,
  purchase_price_cents        bigint      NOT NULL CHECK (purchase_price_cents >= 0),
  salvage_value_cents         bigint      NOT NULL DEFAULT 0 CHECK (salvage_value_cents >= 0),
  purchase_date               date        NOT NULL,
  in_service_date             date        NOT NULL,
  method                      text        NOT NULL DEFAULT 'straight_line'
                                CHECK (method IN ('straight_line','declining_balance','units_of_production')),
  useful_life_months          int         NOT NULL DEFAULT 60 CHECK (useful_life_months > 0),
  convention                  text        NOT NULL DEFAULT 'half_month'
                                CHECK (convention IN ('half_month','mid_month','half_year','full_month')),
  prior_accumulated_depr_cents bigint     NOT NULL DEFAULT 0 CHECK (prior_accumulated_depr_cents >= 0),
  total_expected_units        bigint      CHECK (total_expected_units IS NULL OR total_expected_units > 0),
  asset_account_id            uuid        REFERENCES catalogs.accounts(id),
  accum_depr_account_id       uuid        REFERENCES catalogs.accounts(id),
  depr_expense_account_id     uuid        REFERENCES catalogs.accounts(id),
  acquisition_je_id           uuid        REFERENCES accounting.journal_entries(id),
  status                      text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','fully_depreciated','disposed','voided')),
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  voided_at                   timestamptz,
  voided_by_user_id           uuid        REFERENCES identity.users(id),
  void_reason                 text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id),
  CONSTRAINT fixed_assets_salvage_le_cost CHECK (salvage_value_cents <= purchase_price_cents)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_assets_company_number
  ON accounting.fixed_assets (operating_company_id, asset_number)
  WHERE asset_number IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_fixed_assets_company_status ON accounting.fixed_assets (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_owner ON accounting.fixed_assets (owner_operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_unit ON accounting.fixed_assets (unit_uuid) WHERE unit_uuid IS NOT NULL;

-- §4 — depreciation schedule
CREATE TABLE IF NOT EXISTS accounting.depreciation_schedule_rows (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  asset_id                    uuid        NOT NULL REFERENCES accounting.fixed_assets(id) ON DELETE RESTRICT,
  period_number               int         NOT NULL CHECK (period_number > 0),
  period_date                 date        NOT NULL,
  depreciation_amount_cents   bigint      NOT NULL CHECK (depreciation_amount_cents >= 0),
  accumulated_to_date_cents   bigint      NOT NULL CHECK (accumulated_to_date_cents >= 0),
  book_value_end_cents        bigint      NOT NULL CHECK (book_value_end_cents >= 0),
  method_snapshot             text        NOT NULL,
  units_this_period           bigint,
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_depr_schedule_active_period
  ON accounting.depreciation_schedule_rows (asset_id, period_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_depr_schedule_company_asset
  ON accounting.depreciation_schedule_rows (operating_company_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_depr_schedule_pending
  ON accounting.depreciation_schedule_rows (operating_company_id, period_date)
  WHERE posted = false AND is_active = true;

-- §5 — disposals
CREATE TABLE IF NOT EXISTS accounting.fixed_asset_disposals (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid        NOT NULL REFERENCES org.companies(id),
  asset_id                    uuid        NOT NULL REFERENCES accounting.fixed_assets(id) ON DELETE RESTRICT,
  disposal_date               date        NOT NULL,
  disposal_type               text        NOT NULL DEFAULT 'sale'
                                CHECK (disposal_type IN ('sale','scrap','trade_in','casualty')),
  proceeds_cents              bigint      NOT NULL DEFAULT 0 CHECK (proceeds_cents >= 0),
  book_value_at_disposal_cents bigint     NOT NULL CHECK (book_value_at_disposal_cents >= 0),
  gain_loss_cents             bigint      NOT NULL,
  gain_loss_account_id        uuid        REFERENCES catalogs.accounts(id),
  disposal_je_id              uuid        REFERENCES accounting.journal_entries(id),
  posting_status              text        NOT NULL DEFAULT 'unposted'
                                CHECK (posting_status IN ('unposted','posted','reversed')),
  posted_at                   timestamptz,
  notes                       text,
  is_active                   boolean     NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid        REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid        REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_asset_disposal_active
  ON accounting.fixed_asset_disposals (asset_id) WHERE is_active = true;

-- §6 — grants + RLS (ENABLE + FORCE) + company-scope policy, per table
GRANT SELECT, INSERT, UPDATE ON accounting.fixed_asset_classes        TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.fixed_assets               TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.depreciation_schedule_rows TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.fixed_asset_disposals      TO ih35_app;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fixed_asset_classes','fixed_assets','depreciation_schedule_rows','fixed_asset_disposals']
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

-- §7 — feature flags (posting GATED OFF)
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES
  ('FIXED_ASSETS_ENABLED',
   'UI-1 Fixed Assets — asset register + depreciation schedule (read/compute). GL posting OFF.',
   false),
  ('FIXED_ASSET_AUTOPOST_ENABLED',
   'Fixed Assets — auto-post monthly depreciation JE (Dr Depr Expense / Cr Accum Depr) + disposal JE. Default OFF. GUARD-gated.',
   false)
ON CONFLICT (flag_key) DO NOTHING;
