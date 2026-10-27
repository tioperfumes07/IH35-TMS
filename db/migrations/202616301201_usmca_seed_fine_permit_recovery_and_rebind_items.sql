-- ENG-12: seed USMCA fine_recovery → 4910, permit_recovery → 5700; rebind Fine/I-94
-- driver-deduction items off 7200 admin-fee onto those accounts (by account_number, never name).
-- Historical applied deductions on closed settlements are NOT rewritten here — forward Creator path only.

DO $$
DECLARE
  v_usmca uuid;
  v_fine uuid;
  v_permit uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'USMCA company row not found -- skipping ENG-12 seed';
    RETURN;
  END IF;

  SELECT id INTO v_fine FROM catalogs.accounts
   WHERE operating_company_id = v_usmca AND account_number = '4910'
     AND deactivated_at IS NULL AND is_postable = true LIMIT 1;
  SELECT id INTO v_permit FROM catalogs.accounts
   WHERE operating_company_id = v_usmca AND account_number = '5700'
     AND deactivated_at IS NULL AND is_postable = true LIMIT 1;

  IF v_fine IS NOT NULL THEN
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    ) VALUES (v_usmca, 'fine_recovery', v_fine, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id, updated_at = now();
  ELSE
    RAISE NOTICE 'USMCA 4910 not found -- skipping fine_recovery seed';
  END IF;

  IF v_permit IS NOT NULL THEN
    INSERT INTO accounting.chart_of_accounts_roles (
      operating_company_id, role, account_id, is_active, created_at, updated_at
    ) VALUES (v_usmca, 'permit_recovery', v_permit, true, now(), now())
    ON CONFLICT (operating_company_id, role) WHERE is_active DO UPDATE
      SET account_id = EXCLUDED.account_id, updated_at = now();
  ELSE
    RAISE NOTICE 'USMCA 5700 not found -- skipping permit_recovery seed';
  END IF;

  -- Rebind Fine driver-deduction items off 7200 → 4910
  IF v_fine IS NOT NULL THEN
    UPDATE catalogs.items i
       SET default_income_account_id = v_fine, updated_at = now()
     WHERE i.operating_company_id = v_usmca
       AND i.deactivated_at IS NULL
       AND i.item_name IN (
         'Driver Deduction-Fine-Late Delivery Fee',
         'Driver Deduction-Fines & Violations'
       )
       AND i.default_income_account_id IS DISTINCT FROM v_fine;
  END IF;

  -- Rebind I-94 permit item off 7200 → 5700
  IF v_permit IS NOT NULL THEN
    UPDATE catalogs.items i
       SET default_income_account_id = v_permit, updated_at = now()
     WHERE i.operating_company_id = v_usmca
       AND i.deactivated_at IS NULL
       AND i.item_name = 'Driver Deduction-I-94 Permit'
       AND i.default_income_account_id IS DISTINCT FROM v_permit;
  END IF;
END $$;
