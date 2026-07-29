-- POSTING FLAGS — enable the two QBO PROJECTION flags for TRANSP only.
--
-- OWNER-GATED / FINANCIAL. Ships via db:migrate on deploy. NOT hand-applied: the MCP prod connection
-- alternates between ih35_app and neondb_owner, so DDL/DML through it is a coin flip.
--
-- SCOPE — exactly two flags, one entity:
--   QBO_AR_PAYMENTS_PROJECTION_ENABLED -> TRANSP
--   QBO_EXPENSES_PROJECTION_ENABLED    -> TRANSP
--
-- Prerequisites VERIFIED LIVE 2026-07-28 on a validated read (accounting.chart_of_accounts_roles
-- visible 106 == n_live_tup 106, 3 entities): ar_control, ap_control and expense_default are each
-- bound and active for ALL THREE entities, so both projections can resolve their control accounts.
--
-- DELIBERATELY NOT IN THIS MIGRATION (owner ruling 2026-07-28 — these are CHART-OF-ACCOUNTS decisions,
-- not flag flips, and enabling them would post against accounts that do not exist):
--   PREPAID_EXPENSES_POST        — no prepaid role exists; USMCA has no prepaid account at all.
--   FINANCE_HUB_AMORTIZATION_POST — no amortization role or account exists.
--   FIXED_ASSET_AUTOPOST          — only the depreciation EXPENSE side is bound (depr_expense_default,
--                                   TRK only); there is no accumulated-depreciation control account, so
--                                   the credit side of every entry would have nothing to resolve to.
--   FACTORING_GL_POSTING          — factoring roles are split: TRK is missing 5 of 6, and factor_wire_fee
--                                   is missing on USMCA (not TRK). Separate sequence.
--
-- NEVER TOUCHED HERE, AND MUST STAY OFF (parallel books — we sync FROM QuickBooks and reconcile, we
-- never write back): QBO_JE_PUSH_ENABLED and QBO_ENTITY_PUSH_ENABLED. Verified 0 rows ON at authoring.
--
-- FLAG KEYS: the owner's instruction named these "QBO_AR_PAYMENTS_PROJECTION" / "QBO_EXPENSES_PROJECTION".
-- The registered keys — and the ones the code actually reads (qbo-ar-payments-puller.ts:51,
-- qbo-purchases-puller.ts:38) — carry an "_ENABLED" suffix. lib.feature_flag_overrides.flag_key is a FK to
-- lib.feature_flags, so the unsuffixed names are not merely inert, they are REJECTED. Using the real keys.
--
-- STAGE ORDER (verified live 2026-07-28, complete read visible 170 == n_live_tup 170): stage 1, the mirror
-- pull, is ALREADY ON for TRANSP for both feeds (QBO_AR_PAYMENT_MIRROR_PULL_ENABLED = true,
-- QBO_PURCHASES_MIRROR_PULL_ENABLED = true). These two flags are stage 2, the projection of already-mirrored
-- rows into the ledger. Both stage-2 rows already exist set false, so this migration is an UPDATE, not an
-- INSERT — hence the upsert, which is also what makes a re-run a no-op.
--
-- IDEMPOTENT: upsert on the partial unique index idx_ff_override_oci
-- (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL.
-- Re-running flips nothing that is already correct.

DO $$
DECLARE
  v_transp   uuid;
  v_setter   uuid;
  v_flag     text;
  v_flags    text[] := ARRAY['QBO_AR_PAYMENTS_PROJECTION_ENABLED', 'QBO_EXPENSES_PROJECTION_ENABLED'];
  v_required text[] := ARRAY['ar_control', 'ap_control', 'expense_default'];
  v_role     text;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE legal_name ILIKE 'IH 35 Transportation%' LIMIT 1;
  IF v_transp IS NULL THEN
    -- Fresh/unprovisioned database (CI applies every migration to an empty DB). There is no entity to
    -- enable a flag for, so this migration has nothing to do. Skipping is correct; raising here would
    -- break every fresh-DB migration run for a condition that only means "not seeded yet".
    RAISE NOTICE 'POSTING-FLAGS: TRANSP not present (unprovisioned database) — nothing to enable, skipping';
    RETURN;
  END IF;

  -- Never enable a projection whose control account is not bound. A flag switched on without its role
  -- does not fail at flip time; it fails later, on a real transaction, as a posting that cannot
  -- resolve an account.
  --
  -- This SKIPS rather than RAISEs, and the distinction matters. Role bindings are OPERATIONAL DATA,
  -- not migration output. The migrations that seed them (e.g. 202606290072_ar_control_account_
  -- designation.sql) are themselves conditional on chart-of-accounts rows that a freshly-migrated
  -- database does not have, so on a fresh DB the seed is a no-op and ar_control is simply absent.
  -- An earlier revision of this migration raised here and broke every fresh-DB run — CI caught it
  -- twice. A precondition on operational data cannot be enforced at migration time.
  --
  -- Skipping arms nothing: the flags stay OFF, which is the safe direction, and the NOTICE says why.
  -- The compensating control is the owner's own per-flag gate — after deploy, one real transaction
  -- per flag must produce a BALANCED journal entry before the flag is considered live. A silent skip
  -- therefore cannot masquerade as success. On prod all three roles ARE bound and active for TRANSP
  -- (verified live 2026-07-28 on a complete read), so prod takes the enable path.
  FOREACH v_role IN ARRAY v_required LOOP
    IF NOT EXISTS (
      SELECT 1 FROM accounting.chart_of_accounts_roles
       WHERE operating_company_id = v_transp AND role = v_role AND is_active
    ) THEN
      RAISE NOTICE 'POSTING-FLAGS: required CoA role "%" is not bound+active for TRANSP — enabling nothing, skipping', v_role;
      RETURN;
    END IF;
  END LOOP;

  -- set_by_user_uuid is NOT NULL; reuse the account that set the existing overrides so attribution
  -- stays consistent rather than inventing a synthetic actor.
  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;
  IF v_setter IS NULL THEN
    -- Same unprovisioned-database case: no override has ever been set, so there is no actor to
    -- attribute this to. Skip rather than raise; on prod there are 170 override rows and a setter.
    RAISE NOTICE 'POSTING-FLAGS: no existing feature-flag setter (unprovisioned database) — skipping';
    RETURN;
  END IF;

  FOREACH v_flag IN ARRAY v_flags LOOP
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES
      (gen_random_uuid(), v_flag, v_transp, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
  END LOOP;

  RAISE NOTICE 'POSTING-FLAGS: enabled % projection flag(s) for TRANSP', array_length(v_flags, 1);
END
$$;
