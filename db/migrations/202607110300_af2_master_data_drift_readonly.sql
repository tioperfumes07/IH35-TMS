-- [HOLD-FOR-JORGE — TIER 1] AF-2 — QBO master-data drift resolution: DETECT-ONLY extension.
-- DO NOT RUN ON PROD until Jorge says "OK to merge" (financial cluster: touches accounting.recon_runs
-- CHECK + catalogs.accounts-adjacent flag). Runs only on a Neon branch first; ledger-backfilled at merge.
--
-- WHY: docs/blocks/ACCOUNTING-FINANCE-CONNECTIONS/AF-2-qbo-drift.txt calls for extending the read-only
-- detector for customers/vendors/COA drift; write-back stays OFF/unbuilt. Live-audit finding (this block):
-- apps/backend/src/qbo-sync/{vendors,customers,chart-of-accounts}-reconciler.ts each carry a
-- `healFieldDrift()` step that SILENTLY overwrites local mdata.vendors/mdata.customers/catalogs.accounts
-- business fields (name/phone/email/type) from the QBO mirror, with NO exception row, NO maker/checker,
-- NO flag gate — a direct violation of the locked "AF-2: detect only, write stays OFF"
-- (docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md line 31). This migration:
--   1. Adds the per-entity-only flag QBO_MASTER_DATA_HEAL_ENABLED (default OFF) so the auto-heal can
--      never fire unless an owner explicitly opts one entity in later.
--   2. Extends accounting.recon_runs.run_type (RECON-01, migration 202607022100, already live) with three
--      new read-only run types so master-data drift can be recorded through the SAME audited
--      recon_runs/recon_exceptions tables (ANCHOR_DRIFT class already existed in the exceptions CHECK —
--      unused until now) instead of a new parallel table. Reuses existing infra; no new GL math (none of
--      this touches money).
-- Idempotent (DO blocks + IF NOT EXISTS + ON CONFLICT). No data touched. No posting. Flag OFF.
-- Reversible: DROP the flag row + revert the CHECK constraint to its prior value set.

BEGIN;

-- ── 1. Flag: gates the (already-existing, now-conditional) healFieldDrift() auto-fix. Default OFF. ──
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'QBO_MASTER_DATA_HEAL_ENABLED',
  'AF-2: allow the QBO master-data reconcilers (vendors/customers/chart-of-accounts) to silently '
  || 'overwrite local field values (name/phone/email/type) from the QBO mirror when they drift. '
  || 'DEFAULT OFF — per the locked "detect only, write stays OFF" decision. When OFF (default), a '
  || 'drift is instead recorded as a read-only accounting.recon_exceptions row (ANCHOR_DRIFT) for '
  || 'human review; the local row is never mutated. Per-entity owner-gated only (never a global enable).',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- ── 2. Extend accounting.recon_runs.run_type CHECK with 3 new DETECT-ONLY master-data run types. ──────
-- Postgres CHECK constraints aren't ALTER-in-place; drop and recreate with the widened value set. This
-- table is already live (RECON-01, PR #1831) with rows using only the original 4 values, so widening
-- (never narrowing) the allowed set is safe and non-destructive.
ALTER TABLE accounting.recon_runs DROP CONSTRAINT IF EXISTS recon_runs_run_type_check;
ALTER TABLE accounting.recon_runs ADD CONSTRAINT recon_runs_run_type_check CHECK (run_type IN (
  'am_bank_count', 'pm_categorization_diff', 'on_demand_bank_count', 'on_demand_categorization_diff',
  'master_data_drift_vendors', 'master_data_drift_customers', 'master_data_drift_accounts'
));

COMMIT;
