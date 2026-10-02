-- 202615220600_factor_escrow_reserve_role_to_1236.sql
-- Owner instruction 2026-10-02 (chat, to CC-2): "use your logic, research and i'll follow your recommendation.
-- i won't do it, you do it." Owner ruling the same hour: the Faro escrow account and reserve accounts hold what the
-- factor deducts from loads and what is paid out of them (CCG, etc.); 1230 "Factoring Reserves" has nothing to do with
-- the Faro escrow reserve.
--
-- THE DEFECT (chart-of-accounts configuration, read from the role map, not from balances):
--   role factor_cash_reserve_held -> 1235 Faro Cash Reserve   = the GL of bank account "Faro Cash Reserve"   (correct)
--   role factor_reserve_held      -> 1230 Factoring Reserves  != the GL of bank account "Faro Escrow Reserve" (1236)
-- factor_reserve_held is the role the factoring posters debit for the ESCROW deduction on every Faro wire
-- (accounting/factoring-posting/poster.service.ts) and the role the KPI engine / book reserve read
-- (factoring/factoring-kpi.service.ts). Bound to 1230, escrow posts land on an account no bank account uses, while the
-- Faro Escrow Reserve account's register reads 1236 — the two can never agree. 1236 was created by
-- 202615000000_bind_usmca_cash_gl_accounts.sql for that bank account; the role was never moved with it.
--
-- THE FIX: one guarded UPDATE of the USMCA factor_reserve_held binding, 1230 -> 1236. No account is created, renamed,
-- reclassified or deactivated (reserve accounts stay owner-manual, Rule 19); no posting, balance or bank line is touched.
-- Refuses (RAISE) if 1230 carries any posting for USMCA — moving the binding would strand that history. Idempotent:
-- a re-run, or a binding already on 1236, is a no-op. Audited by tg_audit_row_chart_of_accounts_roles.
-- Guard: scripts/verify-factor-reserve-roles-match-faro-bank-accounts.mjs.

BEGIN;

DO $$
DECLARE
  v_usmca constant uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_1230 uuid;
  v_1236 uuid;
  v_bank_ledger uuid;
  v_postings bigint;
  v_moved int;
BEGIN
  SELECT id INTO v_1230 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '1230';
  SELECT id INTO v_1236 FROM catalogs.accounts WHERE operating_company_id = v_usmca AND account_number = '1236';
  IF v_1236 IS NULL THEN
    RAISE NOTICE '202615220600: USMCA has no 1236 Faro Escrow Reserve account; nothing to rebind';
    RETURN;
  END IF;

  -- The target must be the GL the Faro Escrow Reserve bank account already uses — named, never guessed.
  SELECT ledger_account_id INTO v_bank_ledger
    FROM banking.bank_accounts
   WHERE operating_company_id = v_usmca AND account_name = 'Faro Escrow Reserve' AND is_active
   LIMIT 1;
  IF v_bank_ledger IS DISTINCT FROM v_1236 THEN
    RAISE EXCEPTION '202615220600: bank account Faro Escrow Reserve is not on 1236 (ledger %); refusing to rebind', v_bank_ledger;
  END IF;

  IF v_1230 IS NOT NULL THEN
    SELECT count(*) INTO v_postings
      FROM accounting.journal_entry_postings jp
      JOIN accounting.journal_entries je ON je.id = jp.journal_entry_uuid
     WHERE je.operating_company_id = v_usmca AND jp.account_id = v_1230;
    IF v_postings > 0 THEN
      RAISE EXCEPTION '202615220600: 1230 carries % USMCA posting(s); moving factor_reserve_held would strand them', v_postings;
    END IF;
  END IF;

  UPDATE accounting.chart_of_accounts_roles
     SET account_id = v_1236, updated_at = now()
   WHERE operating_company_id = v_usmca
     AND role = 'factor_reserve_held'
     AND account_id IS DISTINCT FROM v_1236
     AND (v_1230 IS NULL OR account_id = v_1230);
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  RAISE NOTICE '202615220600: factor_reserve_held rebound to 1236 on % row(s)', v_moved;
END $$;

COMMIT;
