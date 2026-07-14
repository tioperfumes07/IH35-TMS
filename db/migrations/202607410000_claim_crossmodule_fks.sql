-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- 11-INSURANCE G11-1 (LINKAGE half only) — insurance.claim -> accident / load / driver forward FKs.
-- Total Connectivity §10a / LINKAGE-LAW §10(d): a claim record must link BOTH ways.
--
-- Verified vs live prod (Neon branch br-raspy-haze-ak8kty33, forked from br-fancy-credit-akjnd07a,
-- 2026-07-14): insurance.claim (migration 0285) carries only policy_id / asset_id / tenant_id. Every
-- existing cross-module FK points INTO the claim (safety.accident_reports.insurance_claim_id [P4-01],
-- safety.incidents.auto_created_claim_id [P4-05], legal.matters.insurance_claim_id [P4-02]) — but the
-- claim itself has NO forward link to the accident it arose from, the load involved, or the driver.
-- From a claim you could not navigate to its load/driver/accident; you had to reverse-search. This adds
-- the three forward FKs to CANONICAL hubs:
--   accident_report_id -> safety.accident_reports(id)  (the "accident" the claim arose from)
--   load_id            -> mdata.loads(id)              (canonical loads hub, NOT dispatch.loads)
--   driver_id          -> mdata.drivers(id)            (canonical drivers hub)
--
-- New columns are all-NULL on add, so the inline FK holds trivially (no NOT VALID / no backfill needed).
-- ON DELETE SET NULL: a voided/removed accident/load/driver leaves the claim, just unlinked (void-not-delete).
-- Additive-only, idempotent (ADD COLUMN IF NOT EXISTS). FORCED RLS + grants unchanged — the new columns
-- inherit insurance.claim's existing tenant_id-scoped FORCE-RLS policy (insurance_claim_tenant_scope, 0285);
-- no new table, no new grant. insurance.claim.tenant_id == the operating company (the RLS predicate compares
-- tenant_id to app.operating_company_id), so all three FK targets are same-entity (LINKAGE-LAW §10 C4).
--
-- OUT OF SCOPE (design-only, per 11-insurance G11-1): GL posting of claim payouts (amount_paid_cents -> JE).
-- This migration is pure schema/linkage — NO posting math. Tier-1 — build-and-hold.

BEGIN;

ALTER TABLE insurance.claim
  ADD COLUMN IF NOT EXISTS accident_report_id uuid REFERENCES safety.accident_reports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS load_id            uuid REFERENCES mdata.loads(id)             ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_id          uuid REFERENCES mdata.drivers(id)           ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_insurance_claim_accident_report
  ON insurance.claim (accident_report_id) WHERE accident_report_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_claim_load
  ON insurance.claim (load_id) WHERE load_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_claim_driver
  ON insurance.claim (driver_id) WHERE driver_id IS NOT NULL;

COMMIT;
