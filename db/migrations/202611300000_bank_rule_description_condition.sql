-- BANK-F02 — bank categorization rules gain a MERCHANT/DESCRIPTION condition, and the two overrides
-- that must exist before specificity ranking takes effect.
--
-- THE GAP (verified on prod 2026-08-03, banking.transaction_categories 17/17 rows visible).
-- Rules matched on `plaid_category_pattern` ONLY. QuickBooks bank rules match on "Bank text contains"
-- / Description, and NetSuite matches on Memo and payee/payor; we had no equivalent at all. That is
-- why LOVE'S TIRE CARE could not be corrected by any rule: Plaid reports it as TRANSPORTATION_GAS
-- because it resolves the merchant BRAND (Love's is a truck stop), not the purchase, and no
-- category-only rule can distinguish a tire from a gallon of diesel at the same merchant. 7 tire
-- purchases ($3,378.54) are sitting in Fuel Expense as a result.
--
-- WHY THESE TWO SEEDS SHIP WITH THE COLUMN, IN ONE MIGRATION. The companion code change ranks matches
-- by specificity (merchant > leaf category > parent category) instead of taking the first match by
-- priority. That fixes the toll inversion, but 21 GENUINE fuel purchases (FUEL AMERICA TRAVEL,
-- $961.32) are mislabelled TRANSPORTATION_PUBLIC_TRANSIT by Plaid and currently reach Fuel Expense
-- ONLY via the broad TRANSPORTATION parent rule. Shipping the ranking without a merchant rule for
-- FUEL AMERICA would leave that spend depending on a rule that is now outranked wherever a leaf rule
-- exists — real expense one edit away from falling out of the P&L. Seeding both in the SAME migration
-- means there is no window in which the tightening is live and the overrides are not.
--
--   LOVE'S TIRE CARE -> Repair & Maintenance   (corrects a WRONG Plaid label)
--   FUEL AMERICA     -> Fuel Expense           (pins a CORRECT outcome that Plaid labels wrongly)
--
-- These two are seeded because each is backed by verified prod rows. No other merchant rule is
-- invented here: a mapping without evidence is a guess, and this table decides which GL account real
-- money lands in.
--
-- SCOPE — this migration does NOT reclassify the historical postings. The $4,593.94 already sitting in
-- Fuel Expense (tolls $1,215.40 incl. a -$309.00 credit + tires $3,378.54) is corrected separately by
-- a reversing journal entry through the existing poster, because the general ledger is append-only and
-- is never repaired with an UPDATE.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS; seeds guarded by NOT EXISTS on (opco, description_pattern).
-- Dynamic org.companies + account resolution — no hardcoded UUID (a fresh-from-0001 CI database seeds
-- gen_random_uuid() companies). No DELETE. Existing rules are untouched: description_pattern defaults
-- NULL, which scores as "no merchant condition" and leaves category-only behaviour exactly as before.

ALTER TABLE banking.transaction_categories
  ADD COLUMN IF NOT EXISTS description_pattern text;

COMMENT ON COLUMN banking.transaction_categories.description_pattern IS
  'BANK-F02: QuickBooks "Bank text contains" parity. When set, matches the bank transaction '
  'description and OUTRANKS any category match. NULL = category-only rule (prior behaviour).';

DO $$
DECLARE
  r_opco   record;
  v_acct   uuid;
  v_added  integer := 0;
BEGIN
  FOR r_opco IN SELECT id, code FROM org.companies LOOP

    -- LOVE'S TIRE CARE -> the entity's maintenance account, resolved through the SAME canonical map
    -- the maintenance poster reads, so the rule cannot drift from where maintenance actually posts.
    SELECT m.account_id INTO v_acct
      FROM accounting.expense_category_account_map m
     WHERE m.operating_company_id = r_opco.id
       AND m.category_kind = 'maintenance' AND m.category_code = 'maintenance'
       AND m.is_active = true
     LIMIT 1;
    IF v_acct IS NOT NULL THEN
      INSERT INTO banking.transaction_categories
        (operating_company_id, plaid_category_pattern, description_pattern, coa_account_id, priority, is_active)
      SELECT r_opco.id, 'AUTO_MAINTENANCE', 'LOVE''S TIRE CARE', v_acct, 5, true
      WHERE NOT EXISTS (
        SELECT 1 FROM banking.transaction_categories t
         WHERE t.operating_company_id = r_opco.id AND t.description_pattern = 'LOVE''S TIRE CARE'
      );
      v_added := v_added + (CASE WHEN FOUND THEN 1 ELSE 0 END);
    END IF;

    -- FUEL AMERICA -> the entity's fuel account, same canonical map.
    SELECT m.account_id INTO v_acct
      FROM accounting.expense_category_account_map m
     WHERE m.operating_company_id = r_opco.id
       AND m.category_kind = 'fuel' AND m.category_code = 'fuel'
       AND m.is_active = true
     LIMIT 1;
    IF v_acct IS NOT NULL THEN
      INSERT INTO banking.transaction_categories
        (operating_company_id, plaid_category_pattern, description_pattern, coa_account_id, priority, is_active)
      SELECT r_opco.id, 'FUEL', 'FUEL AMERICA', v_acct, 5, true
      WHERE NOT EXISTS (
        SELECT 1 FROM banking.transaction_categories t
         WHERE t.operating_company_id = r_opco.id AND t.description_pattern = 'FUEL AMERICA'
      );
      v_added := v_added + (CASE WHEN FOUND THEN 1 ELSE 0 END);
    END IF;

  END LOOP;

  RAISE NOTICE 'BANK-F02: seeded % merchant-condition rule(s)', v_added;
END $$;
