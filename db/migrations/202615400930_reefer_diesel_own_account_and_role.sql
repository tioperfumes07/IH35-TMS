-- 202615400930 — Reefer diesel gets its own GL account and its own role.
--
-- OWNER RULING 2026-10-04: "REEFER FUEL MUST BE CONSIDERED ITS OWN, IN CHART OF ACCOUNTS AND ITEMS",
-- and the reason, in his words: "WE CAN RECEIVE A CREDIT FOR THE REEFER FUEL FROM THE US GOVERNMENT
-- SO WE NEED TO HAVE IT DETAILED HOW MANY GALLONS ETC ... PROBABLY THE MOST IMPORTANT BECAUSE THE
-- GOVERNMENT GIVES BACK REFUND BASED ON REEFER FUEL."
--
-- MEASURED LIVE BEFORE WRITING THIS (USMCA, SET LOCAL app.bypass_rls='lucia', DIRECT endpoint):
--   fuel.fuel_transactions, not voided:  diesel 263 txns / 29,590.4 gal / $172,675.88
--                                        def     60 txns /      4.0 gal /   $1,943.54
--   There is NO 'reefer' fuel_type. Every reefer gallon is recorded as 'diesel' and is
--   indistinguishable from tractor fuel, so ZERO gallons are claimable today.
--
--   The 50xx block already separates fuel that is not tractor diesel:
--     5000 Fuel & Diesel (CostOfGoodsSold) · 5005 Fuel Card Fees · 5010 DEF (Diesel Exhaust Fluid)
--   5015 is the next slot and sits beside DEF by the same logic.
--
-- TWO THINGS THIS BUYS, and the second is the one nobody raised:
--   1. The federal credit is claimed on GALLONS of off-highway / refrigeration diesel. Detail that
--      cannot be separated cannot be claimed.
--   2. Reefer fuel is NOT highway fuel. With every gallon typed 'diesel' today, reefer gallons are
--      flowing into ifta.state_gallons_by_quarter and INFLATING taxable gallons — tax possibly
--      overpaid, in the opposite direction from the credit.
--
-- WHAT THIS MIGRATION DOES NOT DO, deliberately: it does not reclassify one cent of history off
-- 5000. The owner is deleting and re-creating this data; re-created rows land on the right account
-- by construction. A retroactive sweep would move money the source documents never said to move.
--
-- Idempotent. No hardcoded UUID — the company is resolved by its code. Safe to re-run.
--
-- PICKUP FIX (CC-3, fork rehearsal br-dry-butterfly-aka5f971): the role 'reefer_fuel_expense' was not in
-- chart_of_accounts_roles_role_check, so step 2 failed — on production that halts the preDeploy migrate and every deploy
-- after it. Step 0 admits the role first (the dynamic append shape of 202615330600 / 202615370930).

DO $$
DECLARE def text; roles text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  IF def IS NULL THEN RETURN; END IF;
  IF substring(def from '\{([^}]*)\}') IS NOT NULL THEN
    roles := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  END IF;
  IF roles IS NULL OR cardinality(roles) < 10 THEN
    RAISE EXCEPTION '202615400930: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT (roles @> ARRAY['reefer_fuel_expense']) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['reefer_fuel_expense']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;


DO $$
DECLARE
  v_company uuid;
  v_account uuid;
BEGIN
  SELECT id INTO v_company FROM org.companies WHERE code = 'USMCA';
  IF v_company IS NULL THEN
    RAISE NOTICE '202615400930: no company with code USMCA — nothing to do.';
    RETURN;
  END IF;

  -- 1. The account. CostOfGoodsSold, matching 5000/5005/5010, so it lands above gross profit with
  --    the rest of the fuel cost rather than in operating expense.
  SELECT id INTO v_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_company AND account_number = '5015';

  IF v_account IS NULL THEN
    INSERT INTO catalogs.accounts (
      operating_company_id, account_number, account_name, account_type,
      is_postable, currency_code, posts_to_financials, notes
    )
    VALUES (
      v_company, '5015', 'Reefer Diesel (Off-Highway)', 'CostOfGoodsSold',
      true, 'USD', true,
      'Refrigeration-unit diesel, separated from tractor diesel (5000) so its gallons can be claimed '
      || 'against the federal off-highway fuel credit and excluded from IFTA taxable gallons. '
      || 'Owner ruling 2026-10-04.'
    )
    RETURNING id INTO v_account;
    RAISE NOTICE '202615400930: created 5015 Reefer Diesel (Off-Highway).';
  ELSE
    RAISE NOTICE '202615400930: 5015 already exists — left as is.';
  END IF;

  -- 2. The ROLE. Every poster resolves its account through the role table, never by name or number
  --    (365.1). Without this binding the account exists and no poster can legally reach it.
  IF NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
     WHERE operating_company_id = v_company AND role = 'reefer_fuel_expense' AND is_active
  ) THEN
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    VALUES (v_company, 'reefer_fuel_expense', v_account, true);
    RAISE NOTICE '202615400930: bound role reefer_fuel_expense -> 5015.';
  END IF;

  -- 3. The two reefer ITEMS that already exist point their default expense account at 5015.
  --    Truck diesel and DEF are untouched. Items are not created here — they are already in
  --    catalogs.items ("Fuel-Reefer-Diesel", "Relay Reefer Fuel (per gallon)").
  UPDATE catalogs.items
     SET default_expense_account_id = v_account, updated_at = now()
   WHERE operating_company_id = v_company
     AND item_name IN ('Fuel-Reefer-Diesel', 'Relay Reefer Fuel (per gallon)')
     AND (default_expense_account_id IS DISTINCT FROM v_account);
END $$;
