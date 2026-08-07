-- ACCT-F100 — posting_side stops being an independent, hand-supplied value and becomes DERIVED from
-- the mapped account's normal balance, enforced in the database.
--
-- WHY (evidence, not preference). accounting.expense_category_account_map.posting_side is a SECOND
-- source of truth for something catalogs.accounts.account_type already determines. Two sources that
-- nothing reconciles will diverge, and on prod one had: USMCA escrow/escrow carried 'debit' against a
-- Liability account for a week (ACCT-F99, corrected by 202611270000). Two independent write paths let
-- it in — the seed migration 202611190000 inserts a CONSTANT 'debit' for all 16 USMCA mappings, and
-- accounting/expense-category-map/routes.ts accepts posting_side straight from the client with no
-- check against the account. Correcting the one bad row does not stop the third.
--
-- WHY DERIVED AND NOT AUTHORITATIVE. posting_side can never drive a journal entry's DR/CR, because
-- direction is a property of the TRANSACTION, not of the category->account mapping. Two proofs on
-- live code, either one sufficient:
--   * the SAME driver-escrow liability account is CREDITED when escrow is withheld
--     (driver-finance/settlement-payrun-close.service.ts:487) and DEBITED when it is released
--     (driver-finance/escrow-separation.service.ts:7 — "Dr escrow-liability / Cr cash_clearing");
--   * the fuel EXPENSE account, debit-normal and mapped 'debit', is posted CREDIT by
--     fuel/fuel-card-overage-posting.service.ts:104 to reclassify fuel to a driver receivable. Had a
--     poster derived its side from the map, that reclassification would have DEBITED and DOUBLED the
--     fuel expense instead of reversing it.
-- Accordingly every poster hardcodes its own side and reads only .account_id (verified across all 7
-- call sites of resolveAccountForCategory). This migration does NOT change any posting behaviour; it
-- removes the ability of the redundant field to disagree with the account it describes.
--
-- WHY A BEFORE-TRIGGER THAT NORMALISES, RATHER THAN A CHECK THAT REJECTS. A rejecting constraint would
-- abort a FRESH-DATABASE replay at 202611190000 — that migration legitimately inserts 'debit' for
-- escrow and is already applied on prod, so it can never be edited (checksum freeze). Normalising in a
-- BEFORE trigger makes every existing and future writer correct by construction instead of breaking
-- them: the seed's constant becomes harmless, the API's client-supplied value becomes advisory, and
-- divergence stops being expressible. This is the QuickBooks/NetSuite model — an account carries a
-- normal balance; nothing may assert a mapping that contradicts it.
--
-- FAIL LOUD on an unclassified account_type rather than passing the value through. Silently accepting
-- an unknown type is how the original defect stayed invisible. The 8 types below are not an inferred
-- list: catalogs.accounts carries CHECK (account_type = ANY (ARRAY['Asset','Liability','Equity',
-- 'Income','Expense','CostOfGoodsSold','OtherIncome','OtherExpense'])) — verified on prod 2026-08-03 —
-- so this classification is exhaustive over the domain the database itself permits, and the raise below
-- is unreachable while that constraint stands. It becomes reachable only if someone WIDENS the
-- constraint, which is exactly the moment a new type must be classified rather than silently defaulted.
--
-- SECURITY DEFINER is required: catalogs.accounts is FORCE-RLS, and the trigger runs as the writing
-- role (ih35_app) which may not see the account row under the caller's GUC scope. Without it the
-- lookup would return NULL and the trigger would raise on a perfectly valid account. search_path is
-- pinned to defeat search_path injection, per standard practice for SECURITY DEFINER functions.
--
-- Idempotent (CREATE OR REPLACE + DROP/CREATE TRIGGER). No DELETE. Existing rows are NOT rewritten:
-- the one known incoherent row (TRK insurance/insurance -> QBO-7 Income, is_active=false) is a voided
-- historical record under void-not-delete and is left as the record of what was. It cannot become
-- operative silently — reactivating it is an UPDATE, which fires this trigger and normalises it.

CREATE OR REPLACE FUNCTION accounting.derive_expense_category_posting_side()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_type    text;
  v_derived text;
BEGIN
  SELECT a.account_type INTO v_type
    FROM catalogs.accounts a
   WHERE a.id = NEW.account_id;

  IF v_type IS NULL THEN
    RAISE EXCEPTION
      'expense_category_account_map.account_id % does not resolve to a catalogs.accounts row', NEW.account_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_derived := CASE
    WHEN v_type IN ('Asset', 'CostOfGoodsSold', 'Expense', 'OtherExpense') THEN 'debit'
    WHEN v_type IN ('Equity', 'Income', 'Liability', 'OtherIncome')        THEN 'credit'
    ELSE NULL
  END;

  IF v_derived IS NULL THEN
    RAISE EXCEPTION
      'account_type % has no classified normal balance — classify it in accounting.derive_expense_category_posting_side() deliberately; refusing to store an unverified posting_side (FAIL LOUD, no silent fallback)', v_type
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.posting_side := v_derived;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION accounting.derive_expense_category_posting_side() IS
  'ACCT-F100: posting_side is DERIVED from catalogs.accounts.account_type, never hand-supplied. It is '
  'descriptive of the account, not a direction for the GL — posters set DR/CR from the transaction.';

DROP TRIGGER IF EXISTS trg_derive_expense_category_posting_side
  ON accounting.expense_category_account_map;

CREATE TRIGGER trg_derive_expense_category_posting_side
  BEFORE INSERT OR UPDATE OF account_id, posting_side
  ON accounting.expense_category_account_map
  FOR EACH ROW
  EXECUTE FUNCTION accounting.derive_expense_category_posting_side();
