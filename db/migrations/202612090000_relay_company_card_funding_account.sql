-- CONN-3 Part D — give each Relay company card the funding account it actually draws from.
--
-- WHY (this is the thing that blocks stage-1 posting, and it is a schema gap, not an owner decision)
-- CONN-3 stage 1 is "fund the wallet": DR Relay Fuel Wallet (asset) / CR the account the money came
-- from. `integrations.relay_company_cards` today carries only card_last4 / label / source_hint — there
-- is no link from a card to any account, so a poster has no credit side to resolve and cannot be built.
-- Verified on prod br-fancy-credit-akjnd07a (RLS-bypassed): the table has 3 rows (5007, 9104, 9869) and
-- no account column of any kind.
--
-- The mapping itself is already owner-verified and recorded in
-- docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md — 5007 = the Transportation Amex Platinum,
-- 9104 and 9869 = WF debit cards drawing on checking ...6103, all three confirmed against prod
-- banking.bank_transactions Relay debits. Nothing here is inferred or invented: this migration records
-- a mapping the owner already established, in the place code can read it.
--
-- WHY banking.bank_accounts AND NOT catalogs.accounts DIRECTLY
-- The bank account already carries ledger_account_id -> its GL account, so one link serves both uses:
-- the GL credit side for stage 1, and the bank row for stage-3 matching (relay_deposits already has
-- matched_bank_transaction_id waiting for it). Pointing the card straight at a GL account would
-- duplicate the account mapping in a second place and let the two drift.
--
-- SCOPE / SAFETY
-- Additive column + FK + backfill of the 3 existing TRANSP cards. NO posting, NO flag, no money moves.
-- The column is NULLABLE on purpose: a card with no funding account must make the future poster fail
-- CLOSED and countable, not guess a credit side. Backfill is entity-scoped and matches only ACTIVE bank
-- accounts. Idempotent; safe to re-run; inserts/updates nothing on a fresh CI DB.
--
-- DELIBERATELY NOT DONE HERE (1): the 4 settled 'unclassified' deposits ($13,938.75, prod-verified)
-- stay unclassified. Their funding cards are unidentified, and per the owner directive an unknown card
-- is NEVER auto-labeled personal — a company card that was never connected to Plaid looks identical in
-- the feed. Naming those cards is the owner's call and no code here touches them.
--
-- DELIBERATELY NOT DONE HERE (2) — CARD 5007 (Amex Platinum) IS LEFT UNMAPPED ON PURPOSE.
-- Mapping it today would encode a wrong credit side. Its bank account ("Business Platinum Card®",
-- account_class='credit') has ledger_account_id pointing at catalogs.accounts QBO-1150040080
-- "Faro Factoring Reserves" — an **Asset/Savings** account, not a credit-card liability. Verified on
-- prod: it is the ONLY account_class='credit' bank account, and it is the only one whose GL account is
-- not Liability/CreditCard. That mislink is already live: 120 postings totalling $41,191.86 have been
-- CREDITED to Faro Factoring Reserves by bank categorization between 2026-07-04 and 2026-08-04, where a
-- card purchase should instead CREDIT a card liability. Wiring stage-1 Relay funding through that same
-- link would push Amex-funded wallet deposits into the factoring reserve balance too.
-- Which GL account represents this specific card is an OWNER call (TRANSP has QBO-338 "Amex Card-" and
-- QBO-39 "IH 35 Transportation AMEX (deleted)"), so this migration does not choose one. Card 5007 stays
-- NULL and the future poster fails closed on it — the correct behaviour until the mapping is fixed.

BEGIN;

-- Inline REFERENCES (not a follow-up ADD CONSTRAINT): verify:orphan-fk-inventory requires the FK to be
-- declared with the column so a fresh database can never end up with the column but no constraint.
ALTER TABLE integrations.relay_company_cards
  ADD COLUMN IF NOT EXISTS funding_bank_account_id uuid REFERENCES banking.bank_accounts(id);

-- Convergence for a database where the column was already added WITHOUT the inline constraint (prod is
-- exactly that case). ADD COLUMN IF NOT EXISTS is a no-op there, so the inline REFERENCES above never
-- fires and the FK would be missing. This adds it only when absent, leaving fresh DBs untouched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'integrations'
      AND t.relname = 'relay_company_cards'
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid) ILIKE '%funding_bank_account_id%'
  ) THEN
    ALTER TABLE integrations.relay_company_cards
      ADD CONSTRAINT relay_company_cards_funding_bank_account_fk
      FOREIGN KEY (funding_bank_account_id) REFERENCES banking.bank_accounts(id);
  END IF;
END$$;

COMMENT ON COLUMN integrations.relay_company_cards.funding_bank_account_id IS
  'Bank/card account this Relay card draws on. CONN-3 stage 1 credits this account''s ledger_account_id when the wallet is funded, and stage 3 matches the bank row against integrations.relay_deposits.matched_bank_transaction_id. NULL means unmapped: the poster must fail closed, never guess a credit side.';

-- ── Backfill the three owner-verified TRANSP cards ──
DO $$
DECLARE
  v_transp uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'CONN-3 Part D: TRANSP absent (fresh CI DB) — skipping card funding backfill (0 rows).';
    RETURN;
  END IF;

  -- Scope BEFORE the FORCED-RLS reads below. Setting it later would let these lookups run under
  -- whatever app.operating_company_id the connection carried, silently match nothing, and report
  -- success having updated no rows — the exact failure the CONN-3 Part C apply hit.
  PERFORM set_config('app.operating_company_id', v_transp::text, true);

  -- 9104 and 9869 only. 5007 is intentionally absent — see the header: its bank account's GL target is
  -- an Asset ("Faro Factoring Reserves"), not a card liability, and choosing the right one is an owner
  -- call. Refuse to guess a credit side.
  --
  -- Guard the credit side rather than trusting the name match: only link a card to an account whose
  -- ledger account is a real Asset/Checking row. If the ...6103 mapping is ever repointed the way the
  -- Amex one was, this backfill links nothing instead of quietly wiring money to the wrong account.
  UPDATE integrations.relay_company_cards c
     SET funding_bank_account_id = ba.id,
         updated_at = now()
    FROM banking.bank_accounts ba
    JOIN catalogs.accounts led ON led.id = ba.ledger_account_id
   WHERE c.operating_company_id = v_transp
     AND c.funding_bank_account_id IS NULL
     AND c.voided_at IS NULL
     AND ba.operating_company_id = v_transp
     AND ba.is_active = true
     AND led.operating_company_id = v_transp
     AND led.account_type = 'Asset'
     AND led.account_subtype = 'Checking'
     AND c.card_last4 IN ('9104', '9869')
     AND ba.account_name ILIKE '%6103%';
END$$;

COMMIT;
