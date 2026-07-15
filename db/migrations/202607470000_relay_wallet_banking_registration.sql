-- [HOLD-FOR-JORGE — FINANCIAL] CONN-3 Part B (step 1) — register the Relay Fuel Wallet as a BANK ACCOUNT so it
-- appears on /banking (the Banking screen reads banking.bank_accounts, NOT catalogs.accounts — which is why the
-- wallet, seeded only into catalogs.accounts #1295 by 202607290000, does not show today).
--
-- Mirrors QBO's "Relay-Diesel Bank Account": a prepaid / stored-value ASSET modeled as a bank-type account
-- (account_class = 'depository'), NOT a credit-card liability. ledger_account_id -> the Relay Fuel Wallet
-- catalogs.accounts row (#1295, system_purpose = 'relay_fuel_wallet'), which 202607290000 seeds and must be
-- applied FIRST. Additive; idempotent; NO money movement; posts NO GL (booking is a separate, flag-gated block).
-- Runs on a Neon branch by owner/GUARD, then ledger-backfilled.
--
-- account_class DECISION (owner): 'depository' means the wallet COUNTS toward Banking's total_cash KPI (which
-- filters account_class = 'depository', banking.routes.ts) — consistent with mirroring a QBO bank account. If the
-- wallet must instead be a prepaid asset SEPARATE from operating cash, a follow-up migration extends the CHECK
-- with a 'prepaid' value + adjusts the cash KPI. Flagged, not assumed.
--
-- CI-safe: on a fresh-from-0001 DB where the #1295 seed hasn't run (or TRANSP is absent), this inserts 0 rows and
-- passes — it never RAISEs on absent data.

BEGIN;

DO $$
DECLARE
  v_transp uuid;
  v_ledger uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'CONN-3 step1: TRANSP absent (fresh CI DB) — skipping Relay wallet bank-account registration (0 rows).';
    RETURN;
  END IF;

  SELECT id INTO v_ledger
    FROM catalogs.accounts
   WHERE operating_company_id = v_transp
     AND system_purpose = 'relay_fuel_wallet'
   LIMIT 1;
  IF v_ledger IS NULL THEN
    RAISE NOTICE 'CONN-3 step1: Relay Fuel Wallet catalogs.accounts row absent (202607290000 not applied) — skipping (0 rows).';
    RETURN;
  END IF;

  -- scope so banking.bank_accounts row-level security accepts the insert (company_scope policy)
  PERFORM set_config('app.operating_company_id', v_transp::text, true);

  INSERT INTO banking.bank_accounts (
    operating_company_id, account_name, display_name, account_type, account_class,
    ledger_account_id, current_balance_cents, is_active, sync_status
  )
  SELECT v_transp, 'Relay Fuel Wallet', 'Relay Fuel Wallet', 'depository', 'depository',
         v_ledger, 0, true, 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM banking.bank_accounts b
    WHERE b.operating_company_id = v_transp
      AND b.ledger_account_id = v_ledger
  );
END$$;

COMMIT;
