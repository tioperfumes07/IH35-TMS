-- [HOLD-FOR-JORGE — TIER 1] account_role_bindings per-entity — last deferred cross-entity leak (USMCA blocker)
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. DO NOT flip any posting flag. This migration POSTS NOTHING. ***
--
-- PROBLEM: catalogs.account_role_bindings is a GLOBAL role registry (role_key UNIQUE, NO
-- operating_company_id). Several bypass posters (is_lucia_bypass()=true → RLS defeated) resolve a GL
-- account purely by role_key. catalogs.accounts is already per-entity (AF-1: operating_company_id NOT NULL),
-- but the binding row itself carries no entity, so at USMCA launch (2nd entity with its own COA) a TRANSP
-- post could bind to another entity's account. Masked today because TRANSP is the only entity with bindings.
--
-- FIX (NON-BREAKING, forward-compatible — staged):
--   1. ADD operating_company_id uuid — NULLABLE (existing rows/inserts keep working; no SET NOT NULL yet).
--   2. FK operating_company_id -> org.companies(id).
--   3. BACKFILL existing rows to TRANSP (resolved BY CODE from org.companies — NEVER hardcode the UUID:
--      on a fresh CI DB the seeded TRANSP id differs; hardcoding caused an fkey violation in AF-1).
--      Prod TRANSP id is 91e0bf0a-133f-4ce8-a734-2586cfa66d96 (for reference only).
--   4. ADD composite unique (operating_company_id, role_key) WHERE operating_company_id IS NOT NULL —
--      forward-prep so each entity can own one binding per role_key once the global unique is dropped.
--
--   *** RETAINED GLOBAL UNIQUE — JORGE DECISION (see PR body) ***
--   The pre-existing GLOBAL `role_key` UNIQUE (account_role_bindings_role_key_key) is INTENTIONALLY KEPT.
--   Keeping it is fully non-breaking and preserves TRANSP resolution identically. It MUST be dropped in a
--   follow-up (gated) migration BEFORE USMCA can insert its own bindings — otherwise a USMCA row with an
--   existing role_key collides on the global unique. Not dropped here to avoid relaxing a constraint the
--   CRUD (account-role-bindings.routes.ts) + governance workflow (workflow-routes.ts) routes rely on for
--   role_key-based single-row lookups. So this migration is forward-STAGED, not fully USMCA-enabling.
--
--   *** RLS INTENTIONALLY UNCHANGED — JORGE DECISION (see PR body) ***
--   The table keeps its 0010 ROLE-BASED RLS (SELECT: any authenticated user; write: Owner/Admin/Manager/
--   Accountant). It is NOT switched to catalogs.accounts-style entity-scoped RLS because:
--     (a) The leak is on the is_lucia_bypass() poster path where RLS is DEFEATED by design — entity-scoped
--         RLS would not close it. Isolation is enforced instead by explicit SQL predicates in the resolvers
--         (arb.operating_company_id + a.operating_company_id), shipped alongside this migration.
--     (b) The CRUD route (catalogs/account-role-bindings.routes.ts) runs under withCurrentUser, which does
--         NOT set app.operating_company_id. Entity-scoped RLS would 404/deny that live admin surface.
--
-- Idempotent, atomic. CI fresh-DB validates from-migrations (verify-schema-parity baseline updated).

BEGIN;

-- 1. Nullable operating_company_id column (non-breaking).
ALTER TABLE catalogs.account_role_bindings
  ADD COLUMN IF NOT EXISTS operating_company_id uuid;

-- 2. FK -> org.companies(id) (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'catalogs'
      AND table_name = 'account_role_bindings'
      AND constraint_name = 'account_role_bindings_operating_company_id_fkey'
  ) THEN
    ALTER TABLE catalogs.account_role_bindings
      ADD CONSTRAINT account_role_bindings_operating_company_id_fkey
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;
END $$;

-- 3. Backfill existing rows -> TRANSP (resolve id by code; skip if TRANSP not seeded on a bare fresh DB).
DO $$
DECLARE
  v_transp uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NOT NULL THEN
    UPDATE catalogs.account_role_bindings
       SET operating_company_id = v_transp,
           updated_at = now()
     WHERE operating_company_id IS NULL;
  END IF;
END $$;

-- 4. Composite unique for entity-scoped rows (forward-prep; global role_key UNIQUE retained — see header).
CREATE UNIQUE INDEX IF NOT EXISTS uq_account_role_bindings_company_role_key
  ON catalogs.account_role_bindings (operating_company_id, role_key)
  WHERE operating_company_id IS NOT NULL;

-- 5. Supporting index for entity-scoped resolver lookups.
CREATE INDEX IF NOT EXISTS idx_account_role_bindings_company_role_key
  ON catalogs.account_role_bindings (operating_company_id, role_key);

-- 6. Re-assert GRANTs (unchanged from 0010; self-contained per Standing Order #16).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_app') THEN
    GRANT SELECT, INSERT, UPDATE ON catalogs.account_role_bindings TO ih35_app;
  END IF;
END $$;

COMMIT;
