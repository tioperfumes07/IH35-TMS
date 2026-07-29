-- ACCT-F43 — a CoA control role must never point at a single unit's ledger.
--
-- AUTO-APPLY via db:migrate on deploy (owner ruling 2026-07-29). NOT hand-applied: the MCP prod
-- connection alternates between ih35_app and neondb_owner, so DML through it is a coin flip.
--
-- THE DEFECT THIS REPAIRS
-- TRK carries 186 postable per-unit Accumulated Depreciation accounts cloned from QuickBooks —
-- "Accumulated Depreciation TRUCK 170", "Accumulared Depreciation TRUCK 167" (the typo is real),
-- "Accumulated Depreciation REEFER #10202", "CV-Accumulated Depreciation-Nissan Versa S STD 2019".
-- There is NO generic company-level Accumulated Depreciation account: read live 2026-07-28 on Neon
-- br-fancy-credit-akjnd07a under SELECT set_config('app.bypass_rls','lucia',true),
-- COUNT(account_name ILIKE 'Accumulated Depreciation') = 0 out of 186.
--
-- That is why 202610131200 left accounting.fixed_asset_classes.default_accum_depr_account_id NULL on
-- purpose and owned-unit-fixed-asset-register.service.ts resolves the credit leg PER UNIT. Any
-- migration that instead picks a control account by NAME SHAPE (ILIKE / ~* 'accumulated depreciation')
-- selects whichever of the 186 unit ledgers happens to sort first. Binding that as accum_depr_default
-- makes one truck's accumulated-depreciation account the credit leg for the whole company's
-- depreciation — wrong books, silently, on the first autopost that resolves the role.
--
-- WHAT THIS DOES
-- If such a binding exists (whatever created it), deactivate it and clear the system_purpose stamp
-- from the unit account. Void, never delete — same posture 202610131200 used for the TRK factoring
-- bindings. A per-unit account is identified by a numeric token in its name, which is exactly what
-- resolvePerUnitAccumDeprAccountId() matches on; a genuine company-level control account has no unit
-- number and is left alone.
--
-- This does NOT disable FIXED_ASSET_AUTOPOST_ENABLED. The depreciation poster reads
-- fixed_assets.depr_expense_account_id / accum_depr_account_id (row FKs, not roles) and RAISES when a
-- leg is missing, so the register keeps failing closed rather than posting to the wrong account. The
-- flag's own entity scope is enforced by scripts/verify-held-posting-flag-entity-scope.mjs.
--
-- Rule 19: no reserve account is created, reclassified, or bound anywhere in this file.
-- NEVER touches QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED.
-- SKIP + NOTICE, never RAISE: on a fresh CI database none of these rows exist and there is nothing
-- to repair. Idempotent — a second run finds nothing left to deactivate.

BEGIN;

DO $$
DECLARE
  v_repaired integer := 0;
  v_cleared  integer := 0;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL
     OR to_regclass('catalogs.accounts') IS NULL THEN
    RAISE NOTICE 'ACCT-F43: chart-of-accounts tables absent (unprovisioned database) — nothing to repair';
    RETURN;
  END IF;

  -- Deactivate any accumulated-depreciation control binding that points at a per-unit ledger.
  WITH bad AS (
    SELECT r.id AS role_id
      FROM accounting.chart_of_accounts_roles r
      JOIN catalogs.accounts a ON a.id = r.account_id
     WHERE r.role = 'accum_depr_default'
       AND r.is_active
       AND a.account_subtype = 'AccumulatedDepreciation'
       AND a.account_name ~ '[0-9]'
  ), deactivated AS (
    UPDATE accounting.chart_of_accounts_roles r
       SET is_active = false
      FROM bad
     WHERE r.id = bad.role_id
     RETURNING 1
  )
  SELECT count(*) INTO v_repaired FROM deactivated;

  -- Clear the control stamp the bad binding left on the unit account, so a later "prefer an account
  -- already marked accum_depr_default" lookup cannot re-select it.
  UPDATE catalogs.accounts a
     SET system_purpose = NULL
   WHERE a.system_purpose = 'accum_depr_default'
     AND a.account_subtype = 'AccumulatedDepreciation'
     AND a.account_name ~ '[0-9]'
     AND NOT EXISTS (
       SELECT 1 FROM accounting.chart_of_accounts_roles r
        WHERE r.account_id = a.id AND r.role = 'accum_depr_default' AND r.is_active
     );
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  IF v_repaired = 0 AND v_cleared = 0 THEN
    RAISE NOTICE 'ACCT-F43: no per-unit accumulated-depreciation control binding found — nothing to repair';
  ELSE
    RAISE NOTICE 'ACCT-F43: deactivated % per-unit accum_depr_default binding(s); cleared % stray system_purpose stamp(s)',
      v_repaired, v_cleared;
  END IF;
END $$;

COMMIT;
