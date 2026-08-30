-- FACT-PLEDGE / dilution control (owner 2026-08-30).
-- 1) Extend credit-memo reason CHECK (WORM: add codes, never drop old).
-- 2) USMCA-only contra-revenue 4900–4960 (Income / Discounts/Refunds Given).
-- 3) Stamp factoring system_purpose; deactivate duplicate 1200 (keep 1230). Never DELETE.
-- Resolve companies BY CODE. Idempotent.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
  v_parent uuid;
BEGIN
  IF to_regclass('accounting.credit_memos') IS NOT NULL THEN
    ALTER TABLE accounting.credit_memos DROP CONSTRAINT IF EXISTS credit_memos_reason_check;
    ALTER TABLE accounting.credit_memos ADD CONSTRAINT credit_memos_reason_check CHECK (
      reason IN (
        'damage',
        'shortage',
        'rate_dispute',
        'duplicate_billing',
        'detention_dispute',
        'late_delivery',
        'missing_paperwork',
        'lumper_receipt_missing',
        'detention_denied',
        'factoring_dilution',
        'unknown_pending_backup',
        'other'
      )
    );
  END IF;

  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'shortpay CoA: USMCA missing — skip account seed';
    RETURN;
  END IF;

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_usmca, '4900', 'Customer Deductions & Short-Pays', 'Income', 'Discounts/Refunds Given',
         'customer_deduction_parent', false
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4900' AND a.deactivated_at IS NULL
  );

  SELECT id INTO v_parent FROM catalogs.accounts
  WHERE operating_company_id = v_usmca AND account_number = '4900' AND deactivated_at IS NULL LIMIT 1;

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id
  )
  SELECT v_usmca, '4910', 'Short-Pay — Service Failure / Late Delivery', 'Income', 'Discounts/Refunds Given',
         'shortpay_service_failure', true, v_parent
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4910' AND a.deactivated_at IS NULL
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id
  )
  SELECT v_usmca, '4920', 'Short-Pay — Missing or Invalid Paperwork', 'Income', 'Discounts/Refunds Given',
         'shortpay_paperwork', true, v_parent
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4920' AND a.deactivated_at IS NULL
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id
  )
  SELECT v_usmca, '4930', 'Short-Pay — OS&D deducted from freight invoice', 'Income', 'Discounts/Refunds Given',
         'shortpay_osd', true, v_parent
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4930' AND a.deactivated_at IS NULL
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id
  )
  SELECT v_usmca, '4940', 'Short-Pay — Rate or Accessorial Dispute', 'Income', 'Discounts/Refunds Given',
         'shortpay_rate_dispute', true, v_parent
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4940' AND a.deactivated_at IS NULL
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id
  )
  SELECT v_usmca, '4950', 'Short-Pay — Detention / Layover Denied', 'Income', 'Discounts/Refunds Given',
         'shortpay_detention_denied', true, v_parent
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4950' AND a.deactivated_at IS NULL
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, parent_account_id
  )
  SELECT v_usmca, '4960', 'Short-Pay — UNKNOWN / Backup Not Received', 'Income', 'Discounts/Refunds Given',
         'shortpay_unknown', true, v_parent
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '4960' AND a.deactivated_at IS NULL
  );

  UPDATE catalogs.accounts SET system_purpose = 'factoring_ar_assigned'
  WHERE operating_company_id = v_usmca AND account_number = '1210' AND system_purpose IS NULL;
  UPDATE catalogs.accounts SET system_purpose = 'factoring_recoursed_invoices'
  WHERE operating_company_id = v_usmca AND account_number = '1220' AND system_purpose IS NULL;
  UPDATE catalogs.accounts SET system_purpose = 'factoring_reserves'
  WHERE operating_company_id = v_usmca AND account_number = '1230' AND system_purpose IS NULL;
  UPDATE catalogs.accounts SET system_purpose = 'factoring_advance_liability'
  WHERE operating_company_id = v_usmca AND account_number = '2150' AND system_purpose IS NULL;
  UPDATE catalogs.accounts SET system_purpose = 'factoring_fees'
  WHERE operating_company_id = v_usmca AND account_number = '6400' AND system_purpose IS NULL;
  UPDATE catalogs.accounts SET system_purpose = 'factoring_default_interest'
  WHERE operating_company_id = v_usmca AND account_number = '6830' AND system_purpose IS NULL;

  UPDATE catalogs.accounts
     SET is_postable = false,
         deactivated_at = COALESCE(deactivated_at, NOW())
   WHERE operating_company_id = v_usmca
     AND account_number = '1200'
     AND deactivated_at IS NULL;
END $$;

COMMIT;
