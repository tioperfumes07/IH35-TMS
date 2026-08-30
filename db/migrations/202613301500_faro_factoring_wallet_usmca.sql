-- BANK-FARO-01 — USMCA Faro Factoring digital bank (master data only).
--
-- Owner 2026-08-30: Jorge books Cr Faro Factoring - USMCA on the $8,890 lease *payment*.
-- That credit must land on a real banking.bank_accounts row whose GL is NOT:
--   1090 Undeposited Funds, 1230 Factoring Reserves (asset reserve ≠ this wallet),
--   1295 Relay Fuel Wallet, or USMCA FREIGHT / Plaid operating cash.
--
-- Shape copies Relay USMCA (202612070000 + 202612080000): depository, no Plaid, is_dip false,
-- own catalogs.accounts row (entity-scoped 1296 / system_purpose faro_factoring_wallet).
-- Additive · idempotent · NO money movement · posts NO GL.
-- CI-safe: USMCA absent → 0 rows.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'BANK-FARO-01: USMCA absent (fresh CI DB) — skipping Faro wallet CoA seed (0 rows).';
    RETURN;
  END IF;

  PERFORM set_config('app.operating_company_id', v_usmca::text, true);

  INSERT INTO catalogs.accounts
    (account_number, account_name, account_type, account_subtype, operating_company_id, system_purpose, notes)
  SELECT '1296', 'Faro Factoring - USMCA', 'Asset', 'Other Current Assets', v_usmca, 'faro_factoring_wallet',
         'Faro factoring digital bank / proceeds wallet for USMCA. Not 1090, not 1230 reserve, not Relay 1295, not FREIGHT operating cash. Owner books bill payments from this account. No Plaid. BANK-FARO-01.'
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.system_purpose = 'faro_factoring_wallet'
  )
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '1296'
  );
END$$;

DO $$
DECLARE
  v_usmca uuid;
  v_ledger uuid;
  v_forbidden boolean;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'BANK-FARO-01: USMCA absent — skipping Faro bank_accounts registration (0 rows).';
    RETURN;
  END IF;

  PERFORM set_config('app.operating_company_id', v_usmca::text, true);

  SELECT id INTO v_ledger
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND system_purpose = 'faro_factoring_wallet'
   LIMIT 1;
  IF v_ledger IS NULL THEN
    RAISE NOTICE 'BANK-FARO-01: Faro CoA row absent — skipping bank_accounts (0 rows).';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM catalogs.accounts a
     WHERE a.id = v_ledger
       AND (
         a.account_number IN ('1090', '1230', '1295')
         OR a.system_purpose IN ('undeposited_funds', 'relay_fuel_wallet')
         OR a.account_name ILIKE '%FREIGHT%'
       )
  ) INTO v_forbidden;
  IF v_forbidden THEN
    RAISE EXCEPTION 'BANK-FARO-01: Faro wallet ledger collided with 1090/1230/1295/FREIGHT — refusing insert';
  END IF;

  INSERT INTO banking.bank_accounts (
    operating_company_id, account_name, display_name, account_type, account_class,
    ledger_account_id, current_balance_cents, is_active, sync_status, is_dip
  )
  SELECT v_usmca, 'Faro Factoring - USMCA', 'Faro Factoring - USMCA', 'depository', 'depository',
         v_ledger, 0, true, 'active', false
  WHERE NOT EXISTS (
    SELECT 1 FROM banking.bank_accounts b
    WHERE b.operating_company_id = v_usmca
      AND b.ledger_account_id = v_ledger
  )
  AND NOT EXISTS (
    SELECT 1 FROM banking.bank_accounts b
    WHERE b.operating_company_id = v_usmca
      AND b.account_name = 'Faro Factoring - USMCA'
      AND b.deactivated_at IS NULL
  );
END$$;

COMMIT;
