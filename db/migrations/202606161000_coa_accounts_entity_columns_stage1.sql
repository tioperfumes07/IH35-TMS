-- MULTI-ENTITY COA SEPARATION — Path B, STAGE 1 (additive columns only).
-- Adds entity-ownership + system-purpose columns to catalogs.accounts.
-- NULLABLE. operating_company_id carries an FK to org.companies; otherwise NO backfill, NO unique
-- index, NO NOT NULL, NO RLS change, NO behavior change. Nothing reads these columns yet.
-- This is the safe additive stage.
--
-- Later stages (each Tier-1 financial-cluster, GUARD-gated, NEVER self-merged):
--   Stage 2: backfill operating_company_id (355 QBO + 5 non-QBO operational -> TRANSP 91e0bf0a;
--            6999 retired-dup stays deactivated, no entity).
--   Stage 3: decommingle TRANSP/TRK control accounts (reverse-and-repost; no UPDATE on the ledger).
--   Stage 4: per-entity UNIQUE (operating_company_id, system_purpose)
--            WHERE system_purpose IS NOT NULL AND deactivated_at IS NULL + #6999 runtime guard.
--   Stage 5: seed USMCA's own chart + system accounts.
--
-- Reversible (down migration):
--   ALTER TABLE catalogs.accounts DROP COLUMN IF EXISTS system_purpose;
--   ALTER TABLE catalogs.accounts DROP COLUMN IF EXISTS operating_company_id;
--
-- Idempotent. Forward-only.
-- See docs/specs/PATH-B-STAGED-EXECUTION-PLAN.md (Stage 1) and docs/specs/MULTI-ENTITY-SEPARATION.md.

BEGIN;

-- 1. Entity ownership — nullable now (FK below); backfilled in Stage 2 (all -> TRANSP 91e0bf0a).
ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS operating_company_id uuid NULL;

-- 2. System-purpose anchor for #6999-class per-entity constraints — nullable, unconstrained until Stage 4.
ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS system_purpose text NULL;

-- 3. FK to org.companies — nullable column => zero existing-row violations, validates instantly.
--    Idempotent guard so re-runs are safe.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_operating_company_id_fkey'
      AND conrelid = 'catalogs.accounts'::regclass
  ) THEN
    ALTER TABLE catalogs.accounts
      ADD CONSTRAINT accounts_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END$$;

-- 4. Self-contained grants. catalogs.accounts already grants to ih35_app (migration 0065); re-assert
--    table grants + DEFAULT PRIVILEGES idempotently per the Stage-1 self-contained requirement.
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.accounts TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalogs GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;

COMMIT;
