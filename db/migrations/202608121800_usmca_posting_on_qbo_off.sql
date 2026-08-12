-- [FINANCIAL CLUSTER] USMCA permanent flag state — owner-locked 2026-08-12
-- USMCA has NO QuickBooks. TMS is authoritative.
--   • ALL TMS posting-class flags  → enabled = true  for USMCA
--   • ALL QBO-related flags      → enabled = false for USMCA
-- Idempotent · resolves USMCA by org.companies.code · never hardcoded UUID · NOTICE+skip on fresh DB.
-- Does NOT touch TRANSP or TRK. Does NOT enable QBO write-back anywhere.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
  v_setter uuid;
  r record;
  n_on int := 0;
  n_off int := 0;
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL
     OR to_regclass('lib.feature_flags') IS NULL
     OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'USMCA-FLAGS-20260812: prerequisites absent — skip';
    RETURN;
  END IF;

  SELECT id INTO v_usmca
    FROM org.companies
   WHERE code = 'USMCA' AND deactivated_at IS NULL
   LIMIT 1;

  IF v_usmca IS NULL THEN
    RAISE NOTICE 'USMCA-FLAGS-20260812: USMCA company absent — skip';
    RETURN;
  END IF;

  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;

  IF v_setter IS NULL THEN
    RAISE NOTICE 'USMCA-FLAGS-20260812: no flag setter on DB — skip';
    RETURN;
  END IF;

  -- 1) Force every QBO-class flag OFF for USMCA (no QBO account / no sync / no write-back).
  FOR r IN
    SELECT flag_key FROM lib.feature_flags
     WHERE flag_key LIKE 'QBO\_%' ESCAPE '\'
        OR flag_key IN (
          'TMS_QBO_RECON_ENABLED',
          'VOID_QBO_MIRROR_ENABLED',
          'AP_IMPORT_ENABLED'
        )
  LOOP
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES (gen_random_uuid(), r.flag_key, v_usmca, NULL, false, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = false, set_at = now(), expires_at = NULL;
    n_off := n_off + 1;
  END LOOP;

  -- 2) Enable every TMS posting-class flag for USMCA (owner permanent ON).
  FOR r IN
    SELECT flag_key FROM lib.feature_flags
     WHERE flag_key NOT LIKE 'QBO\_%' ESCAPE '\'
       AND (
         flag_key LIKE '%\_GL\_POSTING\_%' ESCAPE '\'
         OR flag_key LIKE '%\_POSTING\_ENABLED' ESCAPE '\'
         OR flag_key LIKE '%\_POST\_ENABLED' ESCAPE '\'
         OR flag_key LIKE '%\_AUTOPOST\_ENABLED' ESCAPE '\'
         OR flag_key LIKE '%\_VOID\_ENABLED' ESCAPE '\'
         OR flag_key IN (
           'GL_POSTING_ENABLED',
           'BANK_DRIVER_ADVANCE_ENABLED',
           'BANK_TX_SPLIT_ENABLED',
           'REVENUE_RECOGNITION_ENABLED',
           'PREPAID_EXPENSES_POST_ENABLED',
           'FINANCE_HUB_AMORTIZATION_POST_ENABLED',
           'FIXED_ASSET_AUTOPOST_ENABLED',
           'SETTLEMENT_DEDUCTION_APPLY_ENABLED',
           'SETTLEMENT_CONTRACT_TERMS_ENABLED',
           'FUEL_CARD_OVERAGE_ENGINE_ENABLED',
           'FUEL_CARD_OVERAGE_GL_POSTING_ENABLED',
           'RELAY_FUEL_INGEST_ENABLED'
         )
       )
  LOOP
    INSERT INTO lib.feature_flag_overrides
      (uuid, flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid, set_at, expires_at)
    VALUES (gen_random_uuid(), r.flag_key, v_usmca, NULL, true, v_setter, now(), NULL)
    ON CONFLICT (flag_key, operating_company_id)
      WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
      DO UPDATE SET enabled = true, set_at = now(), expires_at = NULL;
    n_on := n_on + 1;
  END LOOP;

  RAISE NOTICE 'USMCA-FLAGS-20260812: USMCA posting ON=% QBO-class OFF=% (opco=%)', n_on, n_off, v_usmca;
END
$$;

COMMIT;
