-- SCENTSX 6450 Cash Over & Short — ROUND L.31 M8 (end-of-shift drawer count → over / short). The drawer count compares the cash
-- counted in a register with what the books say is in it (the register's ledger, 1010 Store Cash Registers) and books the difference:
-- short = Dr 6450 / Cr the register, over = Dr the register / Cr 6450, through the ONE journal-entry writer
-- (scentsx/daily-report.service.ts). ScentsX's chart (202616830100) has no such account; CC2's first draft posted the difference to
-- 6400 Trade Shows & Marketing, which is wrong. Same idempotent seed path as the chart: SCENTSX only, NOT EXISTS-guarded, $0 balance.

BEGIN;

DO $$
DECLARE
  v_co uuid;
BEGIN
  SELECT id INTO v_co FROM org.companies WHERE code = 'SCENTSX';
  IF v_co IS NULL THEN
    RETURN; -- no ScentsX company on this database (it is created by 202616820200); nothing to seed
  END IF;
  PERFORM set_config('app.operating_company_id', v_co::text, true);
  INSERT INTO catalogs.accounts (operating_company_id, account_number, account_name, account_type, account_subtype, is_postable)
  SELECT v_co, '6450', 'Cash Over & Short', 'Expense', 'Other Miscellaneous Service Cost', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
     WHERE a.operating_company_id = v_co AND a.deactivated_at IS NULL
       AND (a.account_number = '6450' OR a.account_name = 'Cash Over & Short'));
END $$;

COMMIT;
