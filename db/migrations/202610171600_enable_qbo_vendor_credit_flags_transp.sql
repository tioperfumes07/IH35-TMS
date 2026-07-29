-- ACCT-F47 / ACCT-ECON-05 — enable the two QBO VendorCredit stage flags for TRANSP ONLY.
--
-- OWNER-GATED / FINANCIAL, shipped via db:migrate on deploy — the same mechanism and the same shape as
-- 202610110000_enable_qbo_projection_flags_transp.sql (TRANSP inbound projection enables).
-- NOT hand-applied: the MCP prod connection alternates
-- between ih35_app and neondb_owner, so DML through it is a coin flip.
--
-- SCOPE — exactly two flags, one entity (TRANSP):
--   QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED   -> TRANSP   (Stage 1: QBO VendorCredit -> mdata.qbo_vendor_credits)
--   QBO_VENDOR_CREDITS_PROJECTION_ENABLED   -> TRANSP   (Stage 2: mirror -> accounting.vendor_credits)
--
-- The catalog DEFAULT stays false (202610171200). This is a per-entity override row only, so TRK and USMCA
-- remain OFF and a single UPDATE ... enabled=false reverses it.
--
-- WHY NO CHART-OF-ACCOUNTS PRECONDITION (and why that is not a shortcut): this feed posts NO GL. It is a
-- SUBLEDGER clone, like the QBO Purchase -> accounting.expenses and QBO Payment -> accounting.payments
-- clones, and unlike those two it does not even have a poster to refuse — posting-engine.service.ts
-- contains ZERO references to vendor_credits (verified in-repo), and accounting.vendor_credits has no
-- coa_account_id column at all (verified live on Neon br-fancy-credit-akjnd07a; the POST route explicitly
-- refuses a coa_account_id rather than silently dropping it). There is therefore no control account for a
-- flag flip to leave unresolved. The 202610110000 role check (ar_control / ap_control / expense_default)
-- guards GL-resolving projections; replicating it here would be cargo-cult, not safety.
--
-- NEVER TOUCHED HERE, AND MUST STAY OFF (parallel books — we read FROM QuickBooks and reconcile, we never
-- write back): QBO_JE_PUSH_ENABLED and QBO_ENTITY_PUSH_ENABLED.
--
-- WHAT THE OWNER WILL SEE AFTER DEPLOY: the 4h qbo-sync tick runs vendor_credits_pull then
-- vendor_credits_project for TRANSP, both as isolated runSteps, and both write a durable qbo.sync_runs row
-- (kind qbo_vendor_credits_inbound_mirror / qbo_vendor_credits_projection) even when they find nothing —
-- so an honest zero is distinguishable from a dead cron. QuickBooks' forensic archive holds 6 DISTINCT
-- TRANSP VendorCredits (166 across all entities), which is the expected order of magnitude; the live QBO
-- API is the actual source and its count is whatever QuickBooks currently returns.
--
-- IDEMPOTENT: upsert on the partial unique index idx_ff_override_oci
-- (flag_key, operating_company_id) WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL.
-- Re-running flips nothing that is already correct. Fresh-DB safe: skips with a NOTICE (never RAISEs) when
-- the entity, the flag catalog rows, or a prior override setter do not exist.

DO $$
DECLARE
  v_transp uuid;
  v_setter uuid;
  v_flag   text;
  v_flags  text[] := ARRAY[
    'QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED',
    'QBO_VENDOR_CREDITS_PROJECTION_ENABLED'
  ];
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL OR to_regclass('lib.feature_flags') IS NULL THEN
    RAISE NOTICE 'ACCT-F47: lib.feature_flag(_overrides) absent (unprovisioned database) — nothing to enable, skipping';
    RETURN;
  END IF;

  -- The mirror table must exist before Stage 1 is armed; 202610171200 creates it. A fresh-DB replay applies
  -- migrations in order so this holds, but check rather than assume.
  IF to_regclass('mdata.qbo_vendor_credits') IS NULL THEN
    RAISE NOTICE 'ACCT-F47: mdata.qbo_vendor_credits absent — refusing to arm a stage with no mirror, skipping';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM lib.feature_flags WHERE flag_key = ANY (v_flags)) < 2 THEN
    RAISE NOTICE 'ACCT-F47: vendor-credit flags not registered in lib.feature_flags — skipping (override FK would fail)';
    RETURN;
  END IF;

  SELECT id INTO v_transp FROM org.companies WHERE legal_name ILIKE 'IH 35 Transportation%' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'ACCT-F47: TRANSP not present (unprovisioned database) — nothing to enable, skipping';
    RETURN;
  END IF;

  -- set_by_user_uuid is NOT NULL; reuse the account that set the existing overrides so attribution stays
  -- consistent rather than inventing a synthetic actor.
  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;
  IF v_setter IS NULL THEN
    RAISE NOTICE 'ACCT-F47: no existing feature-flag setter (unprovisioned database) — skipping';
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

  RAISE NOTICE 'ACCT-F47: enabled % vendor-credit stage flag(s) for TRANSP only', array_length(v_flags, 1);
END
$$;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  o.flag_key,
  c.legal_name,
  o.enabled
FROM lib.feature_flag_overrides o
JOIN org.companies c ON c.id = o.operating_company_id
WHERE o.flag_key IN ('QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED','QBO_VENDOR_CREDITS_PROJECTION_ENABLED')
ORDER BY 1, 2;

-- DOWN (owner, one statement — the flags are per-entity overrides, nothing structural):
--   UPDATE lib.feature_flag_overrides SET enabled = false
--    WHERE flag_key IN ('QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED','QBO_VENDOR_CREDITS_PROJECTION_ENABLED');
