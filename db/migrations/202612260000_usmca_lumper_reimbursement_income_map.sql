-- ACCT-F149 (CLS-CATEGORY-MAP-COHERENCE) — USMCA can book a lumper fee it PAYS but not the
-- reimbursement it RECEIVES.
--
-- THE DEFECT. accounting.expense_category_account_map is asymmetric across entities. Verified on
-- prod:
--     TRANSP  lumper/lumper                      debit  -> QBO-117        Warehouse-Lumper Fee Expense
--     TRANSP  lumper/lumper_reimbursement_income credit -> QBO-1150040160 Sales-Warehouse-Lumper Fee-Income
--     USMCA   lumper/lumper                      debit  -> DRIVERTRIPLU056412 Driver Trip-Lumper Reimbursement
--     USMCA   lumper/lumper_reimbursement_income  ** MISSING **
-- So on a USMCA load the lumper EXPENSE posts and the customer's REIMBURSEMENT has nowhere to go —
-- the credit resolves to nothing and the poster raises CATEGORY_MAPPING_MISSING. That is this class's
-- exact signature: a category present on one side and absent on the other fails silently at posting
-- time rather than at configuration time.
--
-- NOTHING IS INVENTED HERE. USMCA already carries account 4230 "Lumper Income" (Income /
-- Service/Fee Income) in its own chart; this migration only adds the MAP ROW pointing at it, with
-- posting_side='credit', mirroring TRANSP's shape. No account is created, no chart is altered.
--
-- WHY TRK IS NOT TOUCHED, and this is the part that must not be "fixed". The same coherence query
-- reports 12 further gaps, all of them TRK missing freight-operations categories — revenue/linehaul,
-- revenue/detention, revenue/fuel_surcharge, revenue/layover, revenue/accessorial, revenue/lumper,
-- fuel/diesel, fuel/def, fuel/oil, fuel/reefer, fuel/misc, lumper/lumper. Those are CORRECT STATE,
-- not defects: TRK is the asset holder and lessor. Verified on prod — TRK has 0 loads, 0 fuel
-- transactions and 0 invoices, while TRANSP has 5/1,554/11,980 and USMCA 3/0/5. Seeding freight
-- revenue and diesel categories onto an entity that hauls nothing would assert a business model it
-- is not in, which is the same error class PERMANENT LAW §1 forbids for asset/depreciation accounts
-- on TRANSP and USMCA. A future agent seeing "TRK is missing 12 categories" should read this
-- paragraph and leave it alone.
--
-- Idempotent: ON CONFLICT DO NOTHING, and it resolves both the company and the account by lookup so
-- no UUID is hardcoded.

DO $$
DECLARE
  v_company uuid;
  v_account uuid;
  v_rows    int := 0;
BEGIN
  IF to_regclass('accounting.expense_category_account_map') IS NULL THEN
    RAISE NOTICE 'ACCT-F149: map table absent — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_company FROM org.companies WHERE code = 'USMCA' AND deactivated_at IS NULL;
  IF v_company IS NULL THEN
    RAISE NOTICE 'ACCT-F149: USMCA not present — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_company
     AND account_number = '4230'
     AND deactivated_at IS NULL;

  IF v_account IS NULL THEN
    -- Refuse rather than invent. If USMCA's Lumper Income account is absent the correct action is a
    -- chart decision by the owner, not an account conjured by a mapping migration.
    RAISE NOTICE 'ACCT-F149: USMCA account 4230 (Lumper Income) not found — mapping NOT created';
    RETURN;
  END IF;

  INSERT INTO accounting.expense_category_account_map
    (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
  VALUES
    (v_company, 'lumper', 'lumper_reimbursement_income', v_account, 'credit', true)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'ACCT-F149: USMCA lumper_reimbursement_income mapping — % row(s) inserted', v_rows;
END
$$;
