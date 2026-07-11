-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- PHASE-4 CROSS-MODULE LINKAGE BATCH (P4-01 + P4-02 + P4-03 migration parts) — Total Connectivity §10a.
-- GUARD-verified vs live prod (2026-07-11): all additive, canonical-targeted, 0 orphans, safe.
-- New columns are all-NULL on add, so the inline FK holds trivially (no NOT VALID needed).
-- Additive-only, idempotent (ADD COLUMN IF NOT EXISTS). FORCED RLS + grants unchanged (new cols inherit).
--   P4-01: safety.accident_reports -> insurance.claim (accidents never reached insurance).
--   P4-02: legal.matters was an ORPHAN -> link to insurance.claim/lawsuit + safety.incidents + mdata.units.
--   P4-03: mdata.assets -> mdata.units bridge (insurance rides assets, safety/accounting ride units).
-- DEFERRED (see the block): P4-03's backfill (by vin/unit_number) + the unit->asset resolver + the
-- Create-Claim/Policy 500/404 fix are code/data follow-ups; this migration only adds the bridge column+FK.
-- Canonical targets only (insurance.claim/lawsuit, safety.incidents, mdata.units — none RETIRE). Tier-1.

BEGIN;

-- P4-01 — safety accident -> insurance claim
ALTER TABLE safety.accident_reports
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_accident_reports_insurance_claim
  ON safety.accident_reports (insurance_claim_id) WHERE insurance_claim_id IS NOT NULL;

-- P4-02 — legal.matters cross-module links
ALTER TABLE legal.matters
  ADD COLUMN IF NOT EXISTS insurance_claim_id uuid REFERENCES insurance.claim(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS insurance_lawsuit_id uuid REFERENCES insurance.lawsuit(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES safety.incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_legal_matters_insurance_claim
  ON legal.matters (insurance_claim_id) WHERE insurance_claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_matters_incident
  ON legal.matters (incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_legal_matters_unit
  ON legal.matters (unit_id) WHERE unit_id IS NOT NULL;

-- P4-03 — asset -> unit bridge (migration part only; backfill + resolver + route fix deferred)
ALTER TABLE mdata.assets
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata.units(id);
CREATE INDEX IF NOT EXISTS idx_assets_unit
  ON mdata.assets (unit_id) WHERE unit_id IS NOT NULL;

COMMIT;
