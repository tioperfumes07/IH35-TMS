-- Enable QBO AR Invoice Stage 1+2 flags for TRANSP ONLY (payment_applications unblock).
-- Same shape as 202610171600_enable_qbo_vendor_credit_flags_transp.sql.
-- Catalog DEFAULT stays false. TRK/USMCA remain OFF.
-- SUBLEDGER ONLY — no GL / no CoA precondition (like vendor credits).

DO $$
DECLARE
  v_transp uuid;
  v_setter uuid;
  v_flag   text;
  v_flags  text[] := ARRAY[
    'QBO_AR_INVOICE_MIRROR_PULL_ENABLED',
    'QBO_AR_INVOICES_PROJECTION_ENABLED'
  ];
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL OR to_regclass('lib.feature_flags') IS NULL THEN
    RAISE NOTICE 'AR-INV: feature flag tables absent — skip';
    RETURN;
  END IF;
  IF to_regclass('mdata.qbo_ar_invoices') IS NULL THEN
    RAISE NOTICE 'AR-INV: mdata.qbo_ar_invoices absent — refuse arm without mirror';
    RETURN;
  END IF;

  IF (SELECT count(*) FROM lib.feature_flags WHERE flag_key = ANY (v_flags)) < 2 THEN
    RAISE NOTICE 'AR-INV: invoice flags not registered — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_transp FROM org.companies WHERE legal_name ILIKE 'IH 35 Transportation%' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'AR-INV: TRANSP not present — skip';
    RETURN;
  END IF;

  SELECT set_by_user_uuid INTO v_setter
    FROM lib.feature_flag_overrides
   WHERE set_by_user_uuid IS NOT NULL
   ORDER BY set_at DESC
   LIMIT 1;
  IF v_setter IS NULL THEN
    RAISE NOTICE 'AR-INV: no existing feature-flag setter — skipping';
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

  RAISE NOTICE 'AR-INV: enabled % AR invoice stage flag(s) for TRANSP only', array_length(v_flags, 1);
END
$$;
