-- FH-1 Fixed Assets + Depreciation — Step 1: asset-register DATA MODEL (no posting, no cron).
-- Finance Hub foundation. BOOK-ONLY (5y straight-line default). All amounts integer cents.
-- New schema fixed_assets.* — tenant-scoped (operating_company_id), RLS ENABLE+FORCE,
-- is_active + soft-delete + audit cols per standing rule. Posting (depreciation/disposal JEs)
-- is a LATER gated step behind FIXED_ASSET_AUTOPOST_ENABLED (registered here, default OFF).
-- See docs/specs/FH-1-FIXED-ASSETS-DEPRECIATION-DESIGN.md §6. Idempotent. SHOWN, gated, never self-merge.

BEGIN;

CREATE SCHEMA IF NOT EXISTS fixed_assets;

-- 1. asset class catalog (per-company; default method / useful life / GL accounts) ------------
CREATE TABLE IF NOT EXISTS fixed_assets.asset_classes (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id          uuid NOT NULL REFERENCES org.companies(id),
  code                          text NOT NULL,                 -- truck | trailer | car | land
  name                          text NOT NULL,
  default_method                text NOT NULL DEFAULT 'straight_line',
  default_useful_life_months    int  NOT NULL DEFAULT 60,
  depreciates                   boolean NOT NULL DEFAULT true,  -- land = false (non-depreciating guard)
  default_asset_account_id      uuid REFERENCES catalogs.accounts(id),
  default_accum_depr_account_id uuid REFERENCES catalogs.accounts(id),
  default_depr_expense_account_id uuid REFERENCES catalogs.accounts(id),
  is_active                     boolean NOT NULL DEFAULT true,
  deleted_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by_user_id            uuid REFERENCES identity.users(id),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id            uuid REFERENCES identity.users(id),
  UNIQUE (operating_company_id, code)
);

-- 2. the asset register --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fixed_assets.assets (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id          uuid NOT NULL REFERENCES org.companies(id),   -- tenant scope
  owner_operating_company_id    uuid NOT NULL REFERENCES org.companies(id),   -- lessor/title-holder (TRK) — depreciation books here (§1.4)
  asset_class_id                uuid REFERENCES fixed_assets.asset_classes(id),
  name                          text NOT NULL,
  vin_serial                    text,
  unit_id                       uuid REFERENCES mdata.units(id),              -- reuse mdata.units where the asset is a truck/trailer
  purchase_price_cents          bigint NOT NULL DEFAULT 0 CHECK (purchase_price_cents >= 0),  -- cost basis
  purchase_date                 date,
  depreciation_method           text NOT NULL DEFAULT 'straight_line',        -- book method (only SL built; field kept)
  useful_life_months            int  NOT NULL DEFAULT 60,
  salvage_value_cents           bigint NOT NULL DEFAULT 0 CHECK (salvage_value_cents >= 0),
  depreciation_start_date       date,                                         -- placed-in-service (half-month convention, §4)
  asset_account_id              uuid REFERENCES catalogs.accounts(id),        -- overridable per asset (else class default)
  accum_depr_account_id         uuid REFERENCES catalogs.accounts(id),
  depr_expense_account_id       uuid REFERENCES catalogs.accounts(id),
  prior_accumulated_depreciation_cents bigint NOT NULL DEFAULT 0 CHECK (prior_accumulated_depreciation_cents >= 0),  -- back-dated (§4)
  status                        text NOT NULL DEFAULT 'active' CHECK (status IN ('acquisition','active','disposed')),
  is_active                     boolean NOT NULL DEFAULT true,
  deleted_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by_user_id            uuid REFERENCES identity.users(id),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id            uuid REFERENCES identity.users(id)
);
CREATE INDEX IF NOT EXISTS idx_fa_assets_company_status ON fixed_assets.assets (operating_company_id, status);
CREATE INDEX IF NOT EXISTS idx_fa_assets_unit ON fixed_assets.assets (unit_id) WHERE unit_id IS NOT NULL;

-- 3. per-asset depreciation schedule (one row per asset per period; regeneratable, audited) --
CREATE TABLE IF NOT EXISTS fixed_assets.depreciation_schedules (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id          uuid NOT NULL REFERENCES org.companies(id),
  asset_id                      uuid NOT NULL REFERENCES fixed_assets.assets(id) ON DELETE RESTRICT,
  period_number                 int  NOT NULL,
  period_date                   date NOT NULL,
  depreciation_amount_cents     bigint NOT NULL DEFAULT 0,
  accumulated_to_date_cents     bigint NOT NULL DEFAULT 0,
  book_value_end_cents          bigint NOT NULL DEFAULT 0,
  method_snapshot               text NOT NULL,                                -- formula snapshot so a regen is reproducible
  posted_journal_entry_id       uuid REFERENCES accounting.journal_entries(id),
  posted_at                     timestamptz,
  is_active                     boolean NOT NULL DEFAULT true,                -- old rows retained (is_active=false) on regen
  deleted_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by_user_id            uuid REFERENCES identity.users(id),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id            uuid REFERENCES identity.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fa_schedule_active_period
  ON fixed_assets.depreciation_schedules (asset_id, period_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fa_schedule_company ON fixed_assets.depreciation_schedules (operating_company_id, asset_id);

-- 4. disposals -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fixed_assets.disposals (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id          uuid NOT NULL REFERENCES org.companies(id),
  asset_id                      uuid NOT NULL REFERENCES fixed_assets.assets(id) ON DELETE RESTRICT,
  disposal_date                 date NOT NULL,
  proceeds_cents                bigint NOT NULL DEFAULT 0,
  gain_loss_cents               bigint,                                       -- proceeds − net book value (sign = gain/loss)
  journal_entry_id              uuid REFERENCES accounting.journal_entries(id),
  is_active                     boolean NOT NULL DEFAULT true,
  deleted_at                    timestamptz,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  created_by_user_id            uuid REFERENCES identity.users(id),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id            uuid REFERENCES identity.users(id)
);
CREATE INDEX IF NOT EXISTS idx_fa_disposals_asset ON fixed_assets.disposals (asset_id);

-- 5. GRANTs (new schema — per CLAUDE.md §15) ------------------------------------------------
GRANT USAGE ON SCHEMA fixed_assets TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA fixed_assets TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA fixed_assets GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;

-- 6. RLS (tenant isolation by operating_company_id) — explicit per table (static-scannable) -
ALTER TABLE fixed_assets.asset_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets.asset_classes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS asset_classes_company_isolation ON fixed_assets.asset_classes;
CREATE POLICY asset_classes_company_isolation ON fixed_assets.asset_classes FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE fixed_assets.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets.assets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assets_company_isolation ON fixed_assets.assets;
CREATE POLICY assets_company_isolation ON fixed_assets.assets FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE fixed_assets.depreciation_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets.depreciation_schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS depreciation_schedules_company_isolation ON fixed_assets.depreciation_schedules;
CREATE POLICY depreciation_schedules_company_isolation ON fixed_assets.depreciation_schedules FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE fixed_assets.disposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_assets.disposals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disposals_company_isolation ON fixed_assets.disposals;
CREATE POLICY disposals_company_isolation ON fixed_assets.disposals FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- 7. register the gated auto-post flag (default OFF; isEnabled() returns false either way) ---
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES ('FIXED_ASSET_AUTOPOST_ENABLED', 'FH-1 monthly depreciation auto-post (Dr Depr Expense / Cr Accum Depr). Default OFF.', false)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK (greenfield schema): DROP SCHEMA fixed_assets CASCADE; DELETE FROM lib.feature_flags WHERE flag_key='FIXED_ASSET_AUTOPOST_ENABLED';
