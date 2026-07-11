-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- P4-05 (DAMAGE-CLAIM-FK) — safety(incident) -> insurance(claim) referential integrity.
-- AGENT-confirmed (migration has no REFERENCES): safety.incidents.auto_created_claim_id (added by
-- 202606071600 WITHOUT a FK) is a dangling pointer — the damage_report -> insurance.claim auto-create
-- worker writes it, but nothing enforces the target exists. This adds FK auto_created_claim_id ->
-- insurance.claim(id) as NOT VALID (enforces new rows without failing on any pre-existing orphan; GUARD
-- runs the 0-orphan check + VALIDATE on the Neon branch). Idempotent (pg_constraint guard). ON DELETE
-- SET NULL — a voided/removed claim leaves the incident, just unlinked. FORCED RLS + grants unchanged.
-- Additive-only. (insurance.claim is canonical, migration 0285.) Tier-1/2 — build-and-hold.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'incidents_auto_created_claim_id_fkey') THEN
    ALTER TABLE safety.incidents
      ADD CONSTRAINT incidents_auto_created_claim_id_fkey
      FOREIGN KEY (auto_created_claim_id) REFERENCES insurance.claim(id) ON DELETE SET NULL NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_incidents_auto_created_claim
  ON safety.incidents (auto_created_claim_id)
  WHERE auto_created_claim_id IS NOT NULL;

COMMIT;
