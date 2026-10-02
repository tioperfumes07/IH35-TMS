-- 202615230600_faro_restore_cash_reserve_1235.sql
-- Lead ROUND 296 (FINAL), owner-relayed 2026-10-02: "1230 = Escrow report (restricted, per invoice). 1235 = Cash report
-- (on deposit, releasable). Drop faro_bucket." Matches the owner's earlier ruling recorded on 1235 itself (R-187 G4:
-- Faro's Cash Rsv is its own pool, GL 1235) and Faro's two real reports (Escrow Reserve Entries / Cash Reserve Entries).
--
-- 202615220800 merged the cash reserve into 1230 on the previous (superseded) instruction. This restores the cash side:
--   - role factor_cash_reserve_held -> 1235 Faro Cash Reserve (reactivated, the merge note removed);
--   - bank account "Faro Cash Reserve" (the register Faro's Cash report feeds) active again on 1235;
--   - bank account "Faro Escrow Reserve" (the register Faro's Escrow report feeds) stays on 1230, its name restored to
--     Faro's report name.
-- 1236 (the duplicate from a failed name search) stays retired. factor_reserve_held stays on 1230. 2155 / 6405 untouched.
-- Configuration only: no journal entry, balance or bank line is written. Refuses if 1230 already carries a posting sourced
-- as a cash-reserve leg (nothing to move — the factoring ledger is empty). Idempotent.

BEGIN;

DO $$
DECLARE
  v_usmca constant uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_1230 uuid; v_1235 uuid;
BEGIN
  SELECT id INTO v_1230 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '1230';
  SELECT id INTO v_1235 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '1235';
  IF v_1230 IS NULL OR v_1235 IS NULL THEN
    RAISE NOTICE '202615230600: USMCA 1230 or 1235 missing; nothing to restore';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.account_id = v_1230) THEN
    RAISE EXCEPTION '202615230600: 1230 already carries postings — a cash-reserve leg may have landed on it; refusing to move the role blind';
  END IF;

  UPDATE catalogs.accounts
     SET deactivated_at = NULL, updated_at = now(),
         notes = btrim(replace(coalesce(notes, ''), '[202615220800] merged into 1230 Factoring Reserves — the one Faro Security Reserve.', ''))
   WHERE id = v_1235 AND (deactivated_at IS NOT NULL OR notes LIKE '%[202615220800]%');

  UPDATE accounting.chart_of_accounts_roles SET account_id = v_1235, updated_at = now()
   WHERE operating_company_id = v_usmca AND role = 'factor_cash_reserve_held' AND account_id IS DISTINCT FROM v_1235;

  UPDATE banking.bank_accounts SET is_active = true, deactivated_at = NULL, ledger_account_id = v_1235, updated_at = now()
   WHERE operating_company_id = v_usmca AND account_name = 'Faro Cash Reserve'
     AND (NOT is_active OR deactivated_at IS NOT NULL OR ledger_account_id IS DISTINCT FROM v_1235);

  UPDATE banking.bank_accounts SET display_name = 'Faro Escrow Reserve', updated_at = now()
   WHERE operating_company_id = v_usmca AND account_name = 'Faro Escrow Reserve' AND display_name IS DISTINCT FROM 'Faro Escrow Reserve';
END $$;

COMMIT;
