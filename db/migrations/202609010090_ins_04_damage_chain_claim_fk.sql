-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] INS-04 — damage_continuity_chains.insurance_claim_id FK.
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Root cause: safety↔ insurance claim link was convention-only (no FK) — can dangle (§10.3).
-- Canonical target (Neon lucia): insurance.claim(id) — NOT a RETIRE table, NOT insurance_claims.
-- Fix: ADD FK ON DELETE RESTRICT after proving 0 dangling ids.
-- Cursor band 20260901xxxx. Idempotent.

BEGIN;

DO $$
DECLARE
  v_dangling bigint;
BEGIN
  IF to_regclass('safety.damage_continuity_chains') IS NULL THEN
    RAISE NOTICE 'INS-04: safety.damage_continuity_chains absent — skip';
    RETURN;
  END IF;
  IF to_regclass('insurance.claim') IS NULL THEN
    RAISE NOTICE 'INS-04: insurance.claim absent — skip';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'damage_continuity_chains_insurance_claim_id_fkey'
      AND conrelid = 'safety.damage_continuity_chains'::regclass
  ) THEN
    RAISE NOTICE 'INS-04: damage_continuity_chains_insurance_claim_id_fkey already present — skip';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_dangling
  FROM safety.damage_continuity_chains d
  WHERE d.insurance_claim_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM insurance.claim c WHERE c.id = d.insurance_claim_id
    );

  IF v_dangling > 0 THEN
    RAISE EXCEPTION 'INS-04 ABORT: % dangling damage_continuity_chains.insurance_claim_id row(s) — surface and fix before FK', v_dangling;
  END IF;

  ALTER TABLE safety.damage_continuity_chains
    ADD CONSTRAINT damage_continuity_chains_insurance_claim_id_fkey
    FOREIGN KEY (insurance_claim_id) REFERENCES insurance.claim(id)
    ON DELETE RESTRICT;
END
$$;

COMMIT;
