-- FLAG-PARITY-01 — close the flag gap for all three entities, ENUMERATED (no wildcard).
--
-- OWNER RULING (2026-07-29): "usmca should have all flags flipped, it should be 100% as well as
-- trucking and transportaiton. except for the sync back to quikcbooks because we do not write to
-- quikcbooks anymore, we are parallel tms erp reconciling daily."
--
-- WHY ENUMERATED AND NOT `WHERE flag_key NOT ILIKE '%QBO%'`: the first draft of this migration used
-- that wildcard and THREE static guards correctly rejected it —
--   verify-held-posting-flag-entity-scope       "FORBIDDEN enable of QBO_JE_PUSH_ENABLED"
--   verify-posting-flags-require-bound-accounts  FACTORING_GL_POSTING without its 8 roles
--   verify-factoring-flag-scope
-- A bulk INSERT..SELECT is opaque: neither a guard nor a human reviewer can see which flags it arms.
-- "Every non-QBO flag" is not an auditable statement; a named list is. The guards were right and the
-- migration was wrong.
--
-- LIVE STATE (prod br-fancy-credit-akjnd07a, complete reads with positive control mdata.units=186):
--   lib.feature_flag_overrides 174==174 · accounting.chart_of_accounts_roles 112==112
--   82 flags. ON/no-row/OFF — TRANSP 41/38/3 · TRK 59/17/6 · USMCA 58/19/5.
--   THE ACTIVE OPERATING CARRIER HAD THE FEWEST FEATURES ENABLED OF THE THREE. Among the flags OFF
--   for TRANSP: period close, period reopen, void reversal, void enforcement, IFTA trip methodology,
--   settlement contract terms, driver escrow separation return, 1099 tax docs. Period close and void
--   enforcement being off on the entity that hauls the freight is a control gap an auditor flags on
--   sight.
--
-- DELIBERATELY EXCLUDED — each with the evidence, so a future agent does not "fix" these back:
--
--  A. Every flag containing 'QBO' (19 of 82). Preserves the write-back kill-switches the owner named
--     (QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED / VOID_QBO_MIRROR_ENABLED — all false on all
--     three entities today and they stay false), and avoids arming inbound QBO pulls for USMCA,
--     which 00_LOCKED_DECISIONS §8.5 records has NO QuickBooks realm at all.
--
--  B. FIXED_ASSET_AUTOPOST_ENABLED, PREPAID_EXPENSES_POST_ENABLED and
--     FINANCE_HUB_AMORTIZATION_POST_ENABLED for TRANSP. These are the three flags TRANSP was missing
--     that are ROLE-GATED, and prod says TRANSP has NONE of the required roles bound:
--       depr_expense_default, accum_depr_default  -> bound on TRK only
--       prepaid_asset_default                     -> bound on TRK, USMCA only
--       amortization_expense_default              -> bound on TRK, USMCA only
--     That TRANSP lacks exactly these flags is not an oversight — it is the system refusing to arm a
--     poster with no account to post to. Arming FIXED_ASSET_AUTOPOST with neither depreciation leg
--     bound yields an unbalanced JE on every depreciation run. Bind the roles in-app FIRST (owner
--     action — role binding decides which GL account depreciation and prepaids hit), then flip.
--
--  C. FACTORING_GL_POSTING_ENABLED (TRK) and REVENUE_RECOGNITION_POST_ENABLED (TRK) stay false —
--     owner ruling 2026-07-29 (TRK does not factor, it leases equipment only) and
--     IH35_UNIFIED_BLUEPRINT_ADDITIONS §18 ("TRK: EXCLUDED — lease lessor, 0 freight loads").
--
--  D. RELAY_FUEL_INGEST_ENABLED for TRK and USMCA. The Relay integration is reporting **error** on
--     TRANSP right now (top-bar health, verified live 2026-07-29). Arming ingest on two entities
--     that have no Relay wallet would multiply a known-broken integration across the book. Enable
--     after Relay is healthy — this is a sequencing call, not a scope reduction.
--
-- IDEMPOTENT: ON CONFLICT DO UPDATE guarded by IS DISTINCT FROM; a second run changes 0 rows.
-- Company-level rows only (user_uuid IS NULL) — the 2 existing user-level overrides are untouched,
-- matching the partial unique index idx_ff_override_oci. NO DDL. NO DELETE.

DO $$
DECLARE
  -- ══ CORRECTION 2026-07-30 — FOUR GL POSTING FLAGS REMOVED FROM THIS MIGRATION ══════════════════
  -- The first draft of this file armed four *_GL_POSTING_ENABLED flags. That was wrong twice over.
  --
  -- (a) THREE OF THEM WOULD THROW ON THE LIVE CARRIER. Each poster resolves its account through
  --     resolveRoleAccount(operating_company_id, <role>), and the role is NOT bound on prod. Verified
  --     on br-fancy-credit-akjnd07a against accounting.chart_of_accounts_roles (112 rows), with
  --     cash_clearing=3 and fuel_overage_receivable=3 in the SAME query as the positive control that
  --     proves the zeros are real and not RLS masking:
  --         PARTS_PURCHASE_GL_POSTING_ENABLED        -> maintenance_parts_expense   0 bindings
  --         SAFETY_FINE_GL_POSTING_ENABLED           -> civil_fines_expense         0 bindings
  --         INSURANCE_CLAIM_RECOVERY_GL_POSTING_ENABLED -> insurance_recovery       0 bindings
  --     safety-fine-posting/poster.service.ts:232 says so outright: "has NO shape-fallback entry, so
  --     this THROWS CoaRoleResolutionError until the owner designates." Arming these means the first
  --     company-paid fine, parts purchase, or insurance recovery throws on TRANSP, TRK and USMCA.
  --
  -- (b) EVEN THE ONE WHOSE ROLE *IS* BOUND DOES NOT BELONG HERE. FUEL_CARD_OVERAGE_GL_POSTING_ENABLED
  --     resolves fuel_overage_receivable, which is bound for all three entities — but money-posting
  --     flags stay OFF until CPA sign-off + Neon tie-out (Rule 13 / §1.4). This file is the
  --     NON-POSTING parity migration, as its own name says. A posting flag was never in scope.
  --
  -- All four are therefore OUT. They are not lost: POSTING_FLAG_REQUIREMENTS in
  -- scripts/verify-posting-flags-require-bound-accounts.mjs now carries all four with their roles, so
  -- any future migration that tries to arm one must NAME the roles and gets caught by the guard if it
  -- does not. This is the same class as the FIXED_ASSET_AUTOPOST catch earlier in the same review.
  --
  -- OWNER ACTION NEEDED before posting can be armed for these three: designate the accounts for
  -- Civil Fines & Penalties (civil_fines_expense), Maintenance Parts Expense
  -- (maintenance_parts_expense), and Insurance Recovery (insurance_recovery). Owner-designated in-app;
  -- no migration may create or bind them.
  -- ═══════════════════════════════════════════════════════════════════════════════════════════════

  -- TRANSP: 28 non-posting flags. The operating carrier's real gap.
  v_transp text[] := ARRAY[
    'AP_IMPORT_ENABLED','AR_AP_AGING_UI_ENABLED','BANK_ACCOUNT_HIDE_ENABLED','CASH_FORECAST_ENABLED',
    'DRIVER_ESCROW_SEPARATION_RETURN_ENABLED','DRIVER_PAYMENT_METHODS_ENABLED','FINANCE_BREAK_EVEN_UI_ENABLED',
    'FINANCE_HUB_AMORTIZATION_ENABLED','FINANCE_HUB_UI_ENABLED','FINANCE_STATEMENTS_UI_ENABLED',
    'FIXED_ASSETS_ENABLED','FUEL_CARD_OVERAGE_ENGINE_ENABLED',
    'IFTA_TRIP_METHODOLOGY_ENABLED','LEGAL_CONTRACTS_ENABLED',
    'MONEY_CONTROL_PERIOD_CLOSE_ENABLED','MONEY_CONTROL_PERIOD_REOPEN_ENABLED','MONEY_CONTROL_VOID_REVERSAL_ENABLED',
    'MY_ACCOUNTANT_ENABLED','OPENING_BALANCE_BOOKKEEPER_CONFIRM',
    'PERIODS_INIT_ENABLED','PREPAID_EXPENSES_ENABLED','REVENUE_RECOGNITION_ENABLED',
    'SETTLEMENT_CAPPED_RECOVERY_ENABLED','SETTLEMENT_CONTRACT_TERMS_ENABLED','TAX_DOC_1099_ENABLED',
    'VOID_ENFORCEMENT_ENABLED','WO_VOID_ENABLED','detention_customer_notify_email'
  ];
  -- TRK and USMCA: the same 3 non-posting flags. RELAY_FUEL_INGEST_ENABLED is excluded from both
  -- (exclusion D); the four GL posting flags are excluded per the correction above.
  v_shared text[] := ARRAY[
    'DRIVER_PAYMENT_METHODS_ENABLED','FUEL_CARD_OVERAGE_ENGINE_ENABLED','MY_ACCOUNTANT_ENABLED'
  ];
  v_written int;
  v_transp_before int;
  v_transp_after int;
  v_setter uuid;
BEGIN
  -- lib.feature_flag_overrides.set_by_user_uuid is NOT NULL REFERENCES identity.users(id): every flag
  -- flip is attributable to a person. Same resolution the prior flag migrations use (e.g.
  -- 202610191400): inherit the most recent setter. On a fresh CI database there are no users and no
  -- prior overrides, so there is nobody to attribute the flip to -- skip rather than invent an
  -- attribution or weaken the constraint. Nothing to enable on an empty DB anyway.
  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;

  IF v_setter IS NULL THEN
    RAISE NOTICE 'FLAG-PARITY: no existing feature-flag setter to attribute these flips to -- skipping';
    RETURN;
  END IF;

  SELECT count(*) INTO v_transp_before
    FROM lib.feature_flag_overrides o JOIN org.companies c ON c.id=o.operating_company_id
   WHERE c.code='TRANSP' AND o.user_uuid IS NULL AND o.enabled;

  INSERT INTO lib.feature_flag_overrides (uuid, flag_key, operating_company_id, enabled, set_at, set_by_user_uuid)
  SELECT gen_random_uuid(), k, c.id, true, now(), v_setter
    FROM org.companies c
    CROSS JOIN LATERAL unnest(
      CASE c.code WHEN 'TRANSP' THEN v_transp WHEN 'TRK' THEN v_shared WHEN 'USMCA' THEN v_shared ELSE ARRAY[]::text[] END
    ) AS k
   WHERE c.code IN ('TRANSP','TRK','USMCA')
     AND EXISTS (SELECT 1 FROM lib.feature_flags f WHERE f.flag_key = k)  -- FK safety
  ON CONFLICT (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
  DO UPDATE SET enabled = true, set_at = now()
  WHERE lib.feature_flag_overrides.enabled IS DISTINCT FROM true;
  GET DIAGNOSTICS v_written = ROW_COUNT;

  SELECT count(*) INTO v_transp_after
    FROM lib.feature_flag_overrides o JOIN org.companies c ON c.id=o.operating_company_id
   WHERE c.code='TRANSP' AND o.user_uuid IS NULL AND o.enabled;

  RAISE NOTICE 'FLAG-PARITY-01: % rows written; TRANSP enabled % -> %', v_written, v_transp_before, v_transp_after;

  -- NOTE: there is deliberately NO "assert the protected flags are still false" block here.
  -- Naming QBO_JE_PUSH_ENABLED / QBO_ENTITY_PUSH_ENABLED inside a statement that also references
  -- `enabled` makes verify-held-posting-flag-entity-scope read the ASSERTION as an ARMING statement
  -- ("FORBIDDEN enable of ..."). That is the same comment/proximity false-positive my own guard v1
  -- had, and the answer is not to weaken the guard: the enumerated arrays above ARE the guarantee.
  -- No flag outside v_transp / v_shared can be written by this migration, and neither array contains
  -- a QBO flag, a role-gated TRANSP posting flag, or a TRK exclusion. That is statically checkable by
  -- a reader and by CI, which is the whole point of enumerating instead of using a wildcard.
END $$;
