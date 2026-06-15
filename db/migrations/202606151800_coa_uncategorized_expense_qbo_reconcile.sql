-- COA-UNCATEGORIZED-EXPENSE-QBO-RECONCILE — point the uncategorized_expense role at QBO's live
-- "Uncategorized Expense" (#25, qbo_account_id='25') and soft-retire the redundant #1015 seed (#6999,
-- qbo_account_id NULL) so nothing posts to a non-QBO bucket / pushes a duplicate at Phase-3 sync.
--
-- GUARD-verified on PROD: catalogs.accounts has BOTH the QBO #25 (qbo_account_id=25) and the #1015
-- seed #6999 (qbo_account_id NULL). FINANCIAL Tier 2 (additive / zero behavior — no posting yet, flag OFF).
--
-- FAIL-SAFE (one transaction): #6999 is soft-retired ONLY inside the branch where the QBO #25 account was
-- found AND the role was repointed to it. If #25 is NOT found, NOTHING happens — the role is never left
-- pointing at a just-deactivated #6999. Portable (target found by qbo_account_id, not a hardcoded UUID),
-- idempotent, guarded → a safe no-op where the data is absent (e.g. ci-migration-test = schema/drift but
-- NOT prod's catalogs.accounts data). Forward-only; rollback noted. CI ephemeral Postgres is the apply gate.

BEGIN;

DO $$
DECLARE
  v_company uuid := '91e0bf0a-133f-4ce8-a734-2586cfa66d96';  -- TRANSP
  v_qbo_uncat uuid;
BEGIN
  SELECT id INTO v_qbo_uncat
  FROM catalogs.accounts
  WHERE qbo_account_id = '25'
    AND account_name ILIKE 'Uncategorized Expense%'
    AND deactivated_at IS NULL
  ORDER BY updated_at DESC
  LIMIT 1;

  -- Only act when the QBO-linked target exists; otherwise leave everything untouched (no broken state).
  IF v_qbo_uncat IS NOT NULL THEN
    -- 1. repoint an existing active uncategorized_expense role row (e.g. one pointing at the #6999 seed)...
    UPDATE accounting.chart_of_accounts_roles
       SET account_id = v_qbo_uncat, updated_at = now()
     WHERE operating_company_id = v_company
       AND role = 'uncategorized_expense'
       AND is_active = true
       AND account_id <> v_qbo_uncat;
    -- ...or insert the mapping if TRANSP has none yet.
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    SELECT v_company, 'uncategorized_expense', v_qbo_uncat, true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.chart_of_accounts_roles
      WHERE operating_company_id = v_company AND role = 'uncategorized_expense' AND is_active = true
    );

    -- 2. ONLY NOW (role is on #25) soft-retire the redundant #1015 seed #6999 (qbo_account_id NULL).
    --    Record preserved (NO DELETE), audit-safe; nothing has posted to it (posting is flag-OFF).
    UPDATE catalogs.accounts
       SET deactivated_at = now(), is_postable = false, updated_at = now()
     WHERE account_number = '6999'
       AND account_name ILIKE 'Uncategorized Expense%'
       AND qbo_account_id IS NULL
       AND deactivated_at IS NULL;
  END IF;
END $$;

COMMIT;

-- ROLLBACK (data migration; run manually only to intentionally revert):
--   UPDATE catalogs.accounts SET deactivated_at = NULL, is_postable = true
--     WHERE account_number='6999' AND account_name ILIKE 'Uncategorized Expense%' AND qbo_account_id IS NULL;
--   (the uncategorized_expense → #25 mapping is the correct target; only revert the role if truly undoing.)
