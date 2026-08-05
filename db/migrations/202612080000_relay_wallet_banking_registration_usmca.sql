-- CONN-3 Part C — register USMCA's Relay Fuel Wallet as a BANK ACCOUNT.
--
-- WHY THIS IS A SEPARATE, NECESSARY STEP (the CoA seed alone does nothing)
-- The wallet lives in TWO places by design and the code reads the SECOND one:
--   * catalogs.accounts #1295 (system_purpose='relay_fuel_wallet') — the GL asset. Part B
--     (202612070000) seeded USMCA's.
--   * banking.bank_accounts — the Banking surface AND the lookup that
--     `resolveRelayWalletBankAccountId()` performs before mirroring any Relay activity
--     (apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts).
-- That resolver is entity-scoped (`ba.operating_company_id = $1`). With no row for USMCA it returns
-- NULL and every USMCA Relay row — fuel draws AND wallet-funding deposits — comes back
-- `skipped_no_wallet`: invisible on /banking, unlinked to unit/driver/load, and outside the
-- reconciling control the wallet exists to provide.
--
-- Verified on prod br-fancy-credit-akjnd07a before writing this (RLS-bypassed; visible 16 == n_live_tup
-- 16, n_tup_del 0, so the zero is a real zero and not RLS masking): exactly ONE 'Relay Fuel Wallet'
-- bank account exists, and it belongs to TRANSP. USMCA has none.
--
-- 202607470000 did this correctly for TRANSP and is entity-scoped — it is simply hardcoded to TRANSP,
-- so it could never cover USMCA. It is applied and therefore frozen; this migration is the USMCA
-- counterpart, not an edit.
--
-- account_class = 'depository' follows the TRANSP precedent deliberately: it mirrors QBO's
-- "Relay-Diesel Bank Account" as a stored-value ASSET, and it means the wallet counts toward Banking's
-- total_cash KPI exactly as TRANSP's already does. Diverging here would make the two entities report
-- cash on different bases — a reconciliation defect worse than the KPI question itself. If the owner
-- later rules prepaid cash out of total_cash, that is one follow-up covering BOTH entities.
--
-- Additive · idempotent · NO money movement · posts NO GL (booking is a separate flag-gated block).
-- CI-safe: on a fresh DB where USMCA or the #1295 seed is absent, this inserts 0 rows and passes.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
  v_ledger uuid;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'CONN-3 Part C: USMCA absent (fresh CI DB) — skipping Relay wallet bank-account registration (0 rows).';
    RETURN;
  END IF;

  -- Scope FIRST, before any catalogs.accounts / banking.bank_accounts read.
  -- catalogs.accounts is FORCED-RLS. Setting the scope only just before the INSERT (which is what
  -- 202607470000 does for TRANSP) leaves the ledger lookup below running under whatever
  -- app.operating_company_id the connection happened to carry — and a wrong-entity GUC makes the
  -- lookup return NULL, which this block cannot distinguish from "the account was never seeded".
  -- The migration then RETURNs, inserts nothing, and reports success. That is not hypothetical:
  -- the first prod apply of this migration silently no-opped for exactly this reason, and only a
  -- follow-up read proved the row was missing. Scope first, and a NULL here means genuinely absent.
  PERFORM set_config('app.operating_company_id', v_usmca::text, true);

  SELECT id INTO v_ledger
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca
     AND system_purpose = 'relay_fuel_wallet'
   LIMIT 1;
  IF v_ledger IS NULL THEN
    RAISE NOTICE 'CONN-3 Part C: USMCA Relay Fuel Wallet catalogs.accounts row absent (202612070000 not applied) — skipping (0 rows).';
    RETURN;
  END IF;

  INSERT INTO banking.bank_accounts (
    operating_company_id, account_name, display_name, account_type, account_class,
    ledger_account_id, current_balance_cents, is_active, sync_status
  )
  SELECT v_usmca, 'Relay Fuel Wallet', 'Relay Fuel Wallet', 'depository', 'depository',
         v_ledger, 0, true, 'active'
  WHERE NOT EXISTS (
    SELECT 1 FROM banking.bank_accounts b
    WHERE b.operating_company_id = v_usmca
      AND b.ledger_account_id = v_ledger
  );
END$$;

COMMIT;
