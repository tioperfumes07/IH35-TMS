-- ACCT-F5434 — bind depr_expense_default + accum_depr_default CoA roles for USMCA.
--
-- ROOT CAUSE: 202608121800_usmca_posting_on_qbo_off.sql force-enabled every TMS posting-class
--   flag for USMCA, including FIXED_ASSET_AUTOPOST_ENABLED, without checking whether that flag's
--   required control accounts were bound. verify-posting-flags-require-bound-accounts.mjs
--   correctly flags this: config/posting-flag-requirements.json requires
--   FIXED_ASSET_AUTOPOST_ENABLED -> [depr_expense_default, accum_depr_default], and Neon-confirmed
--   live (2026-08-18) neither role has a chart_of_accounts_roles row for USMCA. USMCA has 0
--   accounting.fixed_assets rows today (dormant, not firing) but would throw
--   CoaRoleResolutionError on the first USMCA fixed-asset depreciation event.
--
-- FIX: USMCA already has account 1600 "Accumulated Depreciation" (Asset, is_postable) — seeded
--   ahead of need, unbound. Bind it to accum_depr_default. USMCA has no Depreciation Expense
--   account yet — seed one at 6860 (OtherExpense, mirroring 6850 Amortization Expense's shape,
--   the nearest sibling account on USMCA's own CoA) and bind it to depr_expense_default.
--
-- Idempotent · resolves USMCA by org.companies.code · never hardcoded UUID · NOTICE+skip on a
-- fresh/partial DB · additive only (no existing account renamed/deleted) · does not touch
-- TRANSP or TRK (each entity's fixed-asset CoA roles are bound independently; TRK's own
-- accum_depr_default gap is a separate, already-tracked item).
--
-- ACCT-F5684/ACCT-F5685 (checksum-override edit, SECOND pass — corrects ACCT-F5684's own first
-- attempt, both edits registered in scripts/lib/migration-checksum-overrides.json) — §3's two
-- role-binding INSERTs below are now wrapped in exception handlers that catch a CHECK-constraint
-- violation and skip gracefully (RAISE NOTICE) instead of aborting the whole migration.
--
-- On PROD, this file's INSERTs succeeded on first apply (2026-08-18T21:16:37Z) because a
-- LATER-FILENAMED, HELD migration — 202609100050_fa_archive_fixed_assets_schema_coa_roles.sql —
-- had already been Neon-applied by the owner OUT OF FILENAME ORDER on 2026-07-28, three weeks
-- earlier, widening accounting.chart_of_accounts_roles_role_check to admit
-- 'depr_expense_default'/'accum_depr_default'. A FRESH database replay (CI, local dev, a
-- rehearsal branch) applies strictly in filename-sort order and reaches this file BEFORE that
-- later widen ever runs, so the original (unwrapped) INSERTs failed there every time — confirmed
-- live via `gh run view` on origin/main, 2026-08-21.
--
-- ACCT-F5684's FIRST attempt hardcoded a full-superset constraint pre-widen directly in this
-- file. That was WRONG and made things WORSE: it broke the very next constraint-touching
-- migration in filename order, 202609010020_fact_05_factor_wire_fee_role.sql, whose OWN
-- DROP+ADD CHECK constraint carries a smaller, independently-authored role list (self-consistent
-- with ITS OWN real prod apply time, 2026-07-27 — this whole class of migration authors its own
-- role list against whatever the constraint actually was at the moment IT was written, not
-- against filename order — confirmed live: every constraint-touching migration's real prod
-- applied_at timestamp, in chronological order, is internally self-consistent EXCEPT for this
-- one file, which is the sole outlier — applied 2026-08-18, three weeks after every other file
-- in this whole cluster). Once this file's widen let the depr_expense_default/accum_depr_default
-- rows insert early, 202609010020's later, narrower ADD CONSTRAINT failed validating those
-- existing rows against its own list — the exact same failure class, just relocated one file
-- downstream. Confirmed live the same way, moved to a fresh Neon rehearsal branch and
-- reproduced/fixed both directions before writing this comment, 2026-08-21.
--
-- THE CORRECT FIX (this version): make this file's own binding fail SOFT and build no constraint
-- knowledge into it at all. On prod, nothing changes — the try succeeds immediately, exactly as
-- it always has (this content is never re-run against prod; only db:migrate's checksum-override
-- registry changes, which is data about the migrator, not the database). On a fresh replay where
-- this file runs before the constraint permits these two role values, the INSERT is skipped with
-- a NOTICE rather than aborting the whole chain, so every other file — including
-- 202609010020's own list — proceeds completely unaffected, exactly as it does today. The
-- deferred bind a fresh database still needs is completed by a NEW migration, 202612880000
-- (acct_f5685_usmca_fixed_asset_coa_roles_deferred_bind.sql), which runs at the very end of the
-- migration chain — after every constraint-touching file, including the HELD one — and performs
-- the identical bind, idempotently, only if not already done. Proven end-to-end on a disposable
-- Neon rehearsal branch: narrow constraint -> this file's INSERTs skip gracefully with no error
-- -> every intervening file's own DROP+ADD (202609010020's included) succeeds unmodified -> the
-- final widen (202609100050) succeeds -> the new deferred migration completes the bind.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
  v_depr_expense_acct uuid;
  v_accum_depr_acct uuid;
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL
     OR to_regclass('accounting.chart_of_accounts_roles') IS NULL
     OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'ACCT-F5434: prerequisites absent — skip';
    RETURN;
  END IF;

  SELECT id INTO v_usmca
    FROM org.companies
   WHERE code = 'USMCA' AND deactivated_at IS NULL
   LIMIT 1;

  IF v_usmca IS NULL THEN
    RAISE NOTICE 'ACCT-F5434: USMCA company absent — skip';
    RETURN;
  END IF;

  -- §1 — Seed 6860 Depreciation Expense for USMCA if not already present (additive; never
  -- rename/delete an existing account — mirrors the NOT EXISTS guard used by prior CoA seeds).
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_usmca, '6860', 'Depreciation Expense', 'OtherExpense', 'Depreciation',
         'depr_expense_default', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
     WHERE a.operating_company_id = v_usmca
       AND a.deactivated_at IS NULL
       AND (a.account_number = '6860' OR a.system_purpose = 'depr_expense_default')
  );

  -- §2 — Tag the existing 1600 Accumulated Depreciation account's system_purpose if unset, same
  -- convention as 1410/6850 on this entity's own CoA. Never touches the account if it already
  -- carries a different system_purpose (would mean it's bound to something else already).
  UPDATE catalogs.accounts
     SET system_purpose = 'accum_depr_default', updated_at = now()
   WHERE operating_company_id = v_usmca
     AND account_number = '1600'
     AND deactivated_at IS NULL
     AND system_purpose IS NULL;

  -- §3 — Resolve both accounts (post-seed) and bind the roles.
  SELECT id INTO v_depr_expense_acct
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND deactivated_at IS NULL
     AND system_purpose = 'depr_expense_default'
     AND account_type = 'OtherExpense'
     AND is_postable IS TRUE
   LIMIT 1;

  SELECT id INTO v_accum_depr_acct
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND deactivated_at IS NULL
     AND account_number = '1600'
     AND account_type = 'Asset'
     AND is_postable IS TRUE
   LIMIT 1;

  IF v_depr_expense_acct IS NULL THEN
    RAISE EXCEPTION 'ACCT-F5434: missing Depreciation Expense account for USMCA after seed';
  END IF;
  IF v_accum_depr_acct IS NULL THEN
    RAISE EXCEPTION 'ACCT-F5434: missing Accumulated Depreciation (1600) account for USMCA';
  END IF;

  -- ACCT-F5685 — fail-soft: on a fresh/rehearsal DB where this migration runs before the CHECK
  -- constraint has been widened elsewhere (202609100050, a HELD migration applied out of
  -- filename order on real prod), skip gracefully rather than abort the whole chain. The
  -- deferred bind runs to completion later via 202612880000_acct_f5685_..._deferred_bind.sql.
  BEGIN
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (v_usmca, 'depr_expense_default', v_depr_expense_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id, updated_at = now();
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ACCT-F5685: chart_of_accounts_roles_role_check does not yet permit depr_expense_default on this DB — skipping; 202612880000 completes this bind once the constraint widens.';
  END;

  BEGIN
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    )
    VALUES (v_usmca, 'accum_depr_default', v_accum_depr_acct, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id, updated_at = now();
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'ACCT-F5685: chart_of_accounts_roles_role_check does not yet permit accum_depr_default on this DB — skipping; 202612880000 completes this bind once the constraint widens.';
  END;

  RAISE NOTICE 'ACCT-F5434: USMCA depr_expense_default=% accum_depr_default=% seed/tag complete (role binds may be deferred, see ACCT-F5685)',
    v_depr_expense_acct, v_accum_depr_acct;
END
$$;

COMMIT;
