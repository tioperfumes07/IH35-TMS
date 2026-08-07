-- FIX — the Amex bank feed was bridged to an ASSET ("Faro Factoring Reserves"), not a card liability.
--
-- WHAT WAS WRONG
-- banking.bank_accounts "Business Platinum Card®" (account_class='credit') had
-- ledger_account_id -> catalogs.accounts QBO-1150040080 "Faro Factoring Reserves"
-- (Asset / Savings). Bank categorization resolves the bank leg from that column, so every categorized
-- Amex purchase posted DR expense / CR Faro Factoring Reserves. A card purchase must CREDIT a card
-- LIABILITY (you owe more); crediting an asset instead draws down the factoring reserve balance.
--
-- Measured on prod before this migration: 120 postings totalling $41,191.86 credited to
-- QBO-1150040080 between 2026-07-04 and 2026-08-04, still accumulating when found.
--
-- WHY QBO-338 IS THE RIGHT TARGET (verified against QuickBooks itself, the system of record)
-- The live IH 35 Transportation LLC balance sheet as of 2026-08-04 shows:
--   * Liabilities > Current Liabilities > Credit Cards > CL-CC > "Amex Card-" = $101,663.01
--   * Assets > Bank Accounts > "Faro Factoring Reserves" = -$87,641.46
-- Two unrelated accounts in two different sections. QBO carries exactly ONE live Amex — "Amex Card-"
-- (our QBO-338, Liability/CreditCard, postable, not deactivated). The only other Amex row,
-- QBO-39 "IH 35 Transportation AMEX (deleted)", was deactivated 2026-05-18 and does not appear on the
-- balance sheet at all, so it was never a candidate. "Business Platinum Card®" is American Express's
-- own product name for the card, which is why the bank feed and the QBO ledger account read differently.
--
-- SCOPE
-- Repoints exactly one bank account, and only when it is currently pointing at the wrong-TYPE account —
-- so this is a no-op if someone has already corrected it by hand. Entity-scoped. No GL is written here.
--
-- WHAT THIS DOES **NOT** DO — READ THIS
-- Repointing fixes the bridge GOING FORWARD only. The 120 postings already written carry
-- account_id = the Faro Factoring Reserves row; they are immutable ledger history (append-only, never
-- UPDATE) and this migration does not touch them. Clearing that $41,191.86 out of the factoring reserve
-- requires a correcting journal entry, which is a posting decision for the owner — not something a
-- schema migration may take on its own.

BEGIN;

DO $$
DECLARE
  v_transp uuid;
  v_amex_ledger uuid;
  v_rows int;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'amex-repoint: TRANSP absent (fresh CI DB) — skipping (0 rows).';
    RETURN;
  END IF;

  -- Scope BEFORE the FORCED-RLS reads. Setting it later lets these lookups run under whatever
  -- app.operating_company_id the connection carried, return NULL, and silently no-op while reporting
  -- success (the CONN-3 Part C apply hit exactly that).
  PERFORM set_config('app.operating_company_id', v_transp::text, true);

  SELECT id INTO v_amex_ledger
    FROM catalogs.accounts
   WHERE operating_company_id = v_transp
     AND account_number = 'QBO-338'
     AND account_type = 'Liability'
     AND account_subtype = 'CreditCard'
     AND deactivated_at IS NULL
     AND is_postable = true
   LIMIT 1;
  IF v_amex_ledger IS NULL THEN
    RAISE NOTICE 'amex-repoint: QBO-338 Amex card liability not found/postable — skipping (0 rows).';
    RETURN;
  END IF;

  -- Only repoint a credit-class account that is currently bridged to a NON-liability. Keyed on the
  -- defect itself rather than on the account name, so a hand-fix or a renamed feed makes this a no-op
  -- instead of a surprise second write.
  UPDATE banking.bank_accounts ba
     SET ledger_account_id = v_amex_ledger,
         updated_at = now()
    FROM catalogs.accounts led
   WHERE ba.id = (
           SELECT b.id
             FROM banking.bank_accounts b
             JOIN catalogs.accounts l ON l.id = b.ledger_account_id
            WHERE b.operating_company_id = v_transp
              AND b.account_class = 'credit'
              AND b.account_name ILIKE 'Business Platinum Card%'
              AND l.account_type <> 'Liability'
            LIMIT 1
         )
     AND led.id = ba.ledger_account_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'amex-repoint: % bank account(s) repointed to QBO-338 Amex Card-.', v_rows;
END$$;

COMMIT;
