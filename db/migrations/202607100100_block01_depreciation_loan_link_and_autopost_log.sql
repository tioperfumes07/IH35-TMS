-- [HOLD-FOR-JORGE — TIER 1] BLOCK-01 (Fixed-Asset Depreciation) — additive schema ONLY, sized to
-- the actual residual gap. Companion design doc: docs/specs/depreciation-BLOCK-01-DESIGN.md.
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill so prod db:migrate skips it. ***
--
-- WHAT THIS IS NOT: this migration does NOT create a new asset register or a new depreciation
-- schedule. Those already exist and are live-wired (accounting.fixed_assets,
-- accounting.fixed_asset_classes, accounting.depreciation_schedule_rows,
-- accounting.fixed_asset_disposals — migration 202606281060; posting engine
-- apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts). Re-creating
-- them here would be exactly the split-brain-schema mistake already flagged once in this repo
-- (the orphaned 202606151600_fh1_fixed_assets_data_model.sql `fixed_assets.*` schema — see design
-- doc §0.3). NO posting code, NO new GL math, NO flag flips in this migration.
--
-- WHAT THIS IS: two small additive pieces the design doc identifies as genuinely missing —
--   §1 accounting.fixed_assets.financing_loan_id — nullable FK to finance.loans, so a CCG-financed
--     truck/trailer can forward/reverse-drill to the loan that financed it (Law of Total
--     Connectivity, constitution §10a). Metadata only — no posting change.
--   §2 accounting.depreciation_autopost_runs — an APPEND-ONLY audit log for the (not-yet-built)
--     monthly autopost cron design in §3 of the design doc. Posts nothing; it is a receipt of what
--     a future cron run attempted, not a ledger. Grants are SELECT+INSERT only (no UPDATE/DELETE),
--     per the evidence-table rule.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS). No feature flags registered
-- here — the future cron reuses the ALREADY-REGISTERED, currently-unconsumed
-- FIXED_ASSET_AUTOPOST_ENABLED flag (default OFF, registered in 202606281060).

BEGIN;

-- §1 — CCG / financing linkage (nullable, additive; no cascade, no CHECK) --------------------------
ALTER TABLE accounting.fixed_assets
  ADD COLUMN IF NOT EXISTS financing_loan_id uuid REFERENCES finance.loans(id);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_financing_loan
  ON accounting.fixed_assets (financing_loan_id) WHERE financing_loan_id IS NOT NULL;

-- §2 — autopost run audit log (append-only; entity-scoped; FORCE RLS) -------------------------------
CREATE TABLE IF NOT EXISTS accounting.depreciation_autopost_runs (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  run_date              date        NOT NULL,
  asset_id              uuid        NOT NULL REFERENCES accounting.fixed_assets(id),
  outcome               text        NOT NULL CHECK (outcome IN ('posted', 'nothing_to_post', 'skipped_flag_off', 'error')),
  period_count          int         NOT NULL DEFAULT 0 CHECK (period_count >= 0),
  total_posted_cents    bigint      NOT NULL DEFAULT 0 CHECK (total_posted_cents >= 0),
  error_code            text,
  error_message         text,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_depr_autopost_runs_company_date
  ON accounting.depreciation_autopost_runs (operating_company_id, run_date);
CREATE INDEX IF NOT EXISTS idx_depr_autopost_runs_asset
  ON accounting.depreciation_autopost_runs (asset_id);

-- Grants — append-only (evidence of a cron run; NEVER UPDATE/DELETE).
GRANT SELECT, INSERT ON accounting.depreciation_autopost_runs TO ih35_app;

-- RLS — literal ENABLE + FORCE (static rls-migration-scan requires literal ALTER statements).
ALTER TABLE accounting.depreciation_autopost_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.depreciation_autopost_runs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS depreciation_autopost_runs_company_scope ON accounting.depreciation_autopost_runs;
CREATE POLICY depreciation_autopost_runs_company_scope ON accounting.depreciation_autopost_runs FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);

COMMIT;

-- ROLLBACK (greenfield table + additive column — safe to reverse on a branch):
-- ALTER TABLE accounting.fixed_assets DROP COLUMN IF EXISTS financing_loan_id;
-- DROP TABLE IF EXISTS accounting.depreciation_autopost_runs;
