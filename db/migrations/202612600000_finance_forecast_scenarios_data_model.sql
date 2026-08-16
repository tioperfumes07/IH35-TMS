-- LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES — finance forecast/scenario data model (no GL posting).
--
-- /finance/overview, /finance/projections and /finance/scenarios were static placeholders with no
-- entity-scoped read, persistence model, creator, or reload (audit rows 828-829 superseded the
-- earlier broad Live row 745 that had wrongly counted them PASS from mounted-route alone). This
-- migration is the canonical, versioned, USMCA-scoped forecast/scenario model those three leaves
-- read and write. Mirrors the finance.loans / finance.loan_amortization_rows pattern from
-- 202606160100 (FORCE RLS, is_active + void/supersede-not-delete, gated default-OFF flag).
--
-- 1. finance.forecast_scenarios — the versioned header. Never deleted: a scenario is either
--    'draft', 'active', or 'superseded' (superseded_by_scenario_id + superseded_at record what
--    replaced it and when — a real audit trail, not a silent overwrite). At most one scenario per
--    company may be 'active' at a time (enforced by the partial unique index below); activating a
--    new scenario supersedes the previous active one atomically at the application layer.
--
-- 2. finance.forecast_lines — one row per (scenario, period, category). Each line carries an
--    EXPLICIT assumption (assumption_note is NOT NULL — no line may exist without a stated basis
--    for its estimate) and an estimate_amount_cents. actual_amount_cents is nullable and, once
--    recorded, carries actual_source ('manual' today; 'gl_actual' is a documented forward hook for
--    a later automated GL-actual rollup — NOT built here, no GL math invented). gl_account_id /
--    customer_id / vendor_id are optional direct FKs — linkage where a line genuinely owes one, not
--    forced on every line. No amount is ever posted to accounting.journal_entries from this table.
--
-- period_label is denormalized at line-creation time from the parent scenario's period_basis +
-- period_start + period_index, so a period's human label never has to be recomputed and can't drift
-- from how it was actually presented when the assumption was made.

BEGIN;

CREATE TABLE IF NOT EXISTS finance.forecast_scenarios (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid NOT NULL REFERENCES org.companies(id),
  name                        text NOT NULL,
  period_basis                text NOT NULL CHECK (period_basis IN ('monthly','quarterly')),
  period_start                date NOT NULL,
  period_count                int  NOT NULL CHECK (period_count > 0 AND period_count <= 60),
  notes                       text,
  status                      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','superseded')),
  superseded_by_scenario_id   uuid REFERENCES finance.forecast_scenarios(id),
  superseded_at               timestamptz,
  is_active                   boolean NOT NULL DEFAULT true,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  created_by_user_id          uuid REFERENCES identity.users(id),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id          uuid REFERENCES identity.users(id)
);
CREATE INDEX IF NOT EXISTS idx_fin_forecast_scenarios_company
  ON finance.forecast_scenarios (operating_company_id, status);
-- At most one ACTIVE scenario per company — activation supersedes the prior active one first.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_forecast_scenarios_one_active_per_company
  ON finance.forecast_scenarios (operating_company_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS finance.forecast_lines (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid NOT NULL REFERENCES org.companies(id),
  scenario_id                 uuid NOT NULL REFERENCES finance.forecast_scenarios(id) ON DELETE RESTRICT,
  period_index                int  NOT NULL CHECK (period_index >= 0),
  period_label                text NOT NULL,
  category_kind               text NOT NULL CHECK (category_kind IN ('revenue','expense')),
  category_label               text NOT NULL,
  gl_account_id                uuid REFERENCES catalogs.accounts(id),
  customer_id                  uuid REFERENCES mdata.customers(id),
  vendor_id                    uuid REFERENCES mdata.vendors(id),
  assumption_note               text NOT NULL,
  estimate_amount_cents          bigint NOT NULL DEFAULT 0,
  actual_amount_cents            bigint,
  actual_source                  text CHECK (actual_source IN ('manual','gl_actual')),
  actual_recorded_at             timestamptz,
  actual_recorded_by_user_id     uuid REFERENCES identity.users(id),
  is_active                      boolean NOT NULL DEFAULT true,
  deleted_at                     timestamptz,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  created_by_user_id             uuid REFERENCES identity.users(id),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id             uuid REFERENCES identity.users(id),
  CONSTRAINT chk_fin_forecast_lines_actual_source_requires_amount
    CHECK (actual_amount_cents IS NULL OR actual_source IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_fin_forecast_lines_company_scenario
  ON finance.forecast_lines (operating_company_id, scenario_id);
CREATE INDEX IF NOT EXISTS idx_fin_forecast_lines_scenario_period
  ON finance.forecast_lines (scenario_id, period_index);

-- GRANTs (new schema already exists from 202606160100 — finance.* — but repeat idempotently) ------
GRANT USAGE ON SCHEMA finance TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA finance TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;

-- RLS (tenant isolation) --------------------------------------------------------------------------
ALTER TABLE finance.forecast_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.forecast_scenarios FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forecast_scenarios_company_isolation ON finance.forecast_scenarios;
CREATE POLICY forecast_scenarios_company_isolation ON finance.forecast_scenarios FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

ALTER TABLE finance.forecast_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.forecast_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS forecast_lines_company_isolation ON finance.forecast_lines;
CREATE POLICY forecast_lines_company_isolation ON finance.forecast_lines FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

-- Register the gated flag (default OFF) -----------------------------------------------------------
INSERT INTO lib.feature_flags (flag_key, description, default_enabled)
VALUES (
  'FINANCE_HUB_SCENARIOS_ENABLED',
  'LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES — versioned forecast/scenario planning (Overview + Projections + Scenarios). Read/write model only, no GL posting. Default OFF.',
  false
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

-- ROLLBACK (greenfield tables): DROP TABLE finance.forecast_lines; DROP TABLE finance.forecast_scenarios;
--   DELETE FROM lib.feature_flags WHERE flag_key = 'FINANCE_HUB_SCENARIOS_ENABLED';
