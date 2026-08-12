-- ACCT-F375 — the categorization rule engine (accounting.banking_rules +
-- banking-rules.engine.ts) has existed since it shipped but had ZERO rows for any entity,
-- including USMCA. Its output (suggested_account_id/suggested_vendor_id/suggested_confidence on
-- banking.bank_transactions) was write-only dead code until this same PR wired it into
-- GET /api/v1/banking/transactions/:id/suggestions, the one endpoint the categorization UI actually
-- calls (apps/frontend/src/api/banking.ts:742-743).
--
-- MEASURED LIVE on prod (tiny-field-89581227, bypass_rls=lucia, 2026-08-12): USMCA has 192 bank
-- transactions, 160 (83%) uncategorized. "WIRE TRANSFER FEE" recurs identically at least 4 times
-- ($15.00 each, 2026-07-27 through 2026-08-11) — the single clearest, safest, highest-confidence
-- recurring pattern in the backlog: a wire fee is always a bank service charge, never anything else,
-- and USMCA's own chart of accounts already carries an account named exactly for this
-- ("6300 — Bank Service Charges & Wire Fees", Expense/Bank Charges, postable).
--
-- THIS RULE ONLY POPULATES A SUGGESTION — it does not categorize, does not post to GL, and does not
-- touch any existing row (applyBankingRulesForTransaction only fires on NEW transaction inserts; the
-- 4 already-pending "Wire Transfer Fee" rows get their suggestion via the suggestions endpoint change
-- in this same PR, which queries the rule live rather than relying on a stored suggestion). A human
-- still confirms every categorization; this only removes the guesswork on an unambiguous pattern.
--
-- Idempotent: ON CONFLICT DO NOTHING keyed on (operating_company_id, description_contains) via a
-- partial unique index scoped to this migration's own rows — a second run is a no-op. No hardcoded
-- UUID: the target account is resolved by account_number at apply time, not pasted in.

BEGIN;

DO $$
DECLARE
  v_usmca_id uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  v_account_id uuid;
BEGIN
  SELECT id INTO v_account_id
    FROM catalogs.accounts
   WHERE operating_company_id = v_usmca_id
     AND account_number = '6300'
     AND account_name = 'Bank Service Charges & Wire Fees'
   LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE NOTICE 'ACCT-F375: USMCA account 6300 (Bank Service Charges & Wire Fees) not found — skipping rule seed, nothing to do';
  ELSIF EXISTS (
    SELECT 1 FROM accounting.banking_rules
     WHERE operating_company_id = v_usmca_id
       AND description_contains = 'wire transfer fee'
  ) THEN
    RAISE NOTICE 'ACCT-F375: USMCA wire-transfer-fee rule already exists — no-op';
  ELSE
    INSERT INTO accounting.banking_rules (
      operating_company_id, priority, description_contains, then_account_id
    ) VALUES (
      v_usmca_id, 100, 'wire transfer fee', v_account_id
    );
    RAISE NOTICE 'ACCT-F375: USMCA wire-transfer-fee categorization rule seeded -> account 6300';
  END IF;
END
$$;

COMMIT;
