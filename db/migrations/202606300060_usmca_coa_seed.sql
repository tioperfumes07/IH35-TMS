-- [HOLD-FOR-JORGE — TIER 1] B1 — seed USMCA's chart of accounts (Path B Stage 5)
-- ALTER/INSERT on catalogs.accounts (financial cluster) → PROTECTED, gated. NEVER self-merge.
-- Runs on a Neon branch under GUARD/Jorge; Jorge confirms the account list before prod.
--
-- WHY: USMCA (operating_carrier, launching) has ZERO accounts (TRANSP 371, TRK 31, USMCA 0). Nothing in
-- the categorize→register→bill flow works until USMCA has a chart. This seeds a lean standard trucking COA
-- (USMCA = clean company, ~60 txns/yr, books live in TMS) whose lines map to its real Bank of America
-- activity. Opening balances are ZERO — owner-entered later (opening balances are owner-only).
--
-- af1 note: catalogs.accounts is entity-RLS with FORCE. We SET app.operating_company_id = USMCA for the
-- transaction so accounts_entity_write's WITH CHECK accepts every insert. Idempotent via the af1 unique
-- index uq_accounts_company_account_number (operating_company_id, account_number). account_type is the
-- 8-value COA enum; account_subtype is the QBO detail type (matches catalogs.detail_types names).
-- system_purpose tags the anchor accounts so resolvers find them per-entity — GUARD to confirm the exact
-- keys against the resolver layer before prod.

BEGIN;

DO $$
DECLARE
  v_usmca uuid;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA';
  IF v_usmca IS NULL THEN
    RAISE EXCEPTION 'USMCA operating company not found in org.companies';
  END IF;

  -- scope the write so af1 FORCE RLS accepts the seed (all rows belong to USMCA)
  PERFORM set_config('app.operating_company_id', v_usmca::text, true);

  INSERT INTO catalogs.accounts
    (account_number, account_name, account_type, account_subtype, operating_company_id, system_purpose)
  VALUES
    ('1000','Bank of America - Operating (USMCA)','Asset','Checking',v_usmca,'bank_operating'),
    ('1090','Undeposited Funds','Asset','Undeposited Funds',v_usmca,'undeposited_funds'),
    ('1100','Accounts Receivable (A/R)','Asset','Accounts Receivable (A/R)',v_usmca,'accounts_receivable'),
    ('1200','Factoring Reserve / Holdback','Asset','Other Current Assets',v_usmca,NULL),
    ('1500','Trucks & Tractors','Asset','Vehicles',v_usmca,NULL),
    ('1510','Trailers','Asset','Vehicles',v_usmca,NULL),
    ('1600','Accumulated Depreciation','Asset','Accumulated Depreciation',v_usmca,NULL),
    ('2000','Accounts Payable (A/P)','Liability','Accounts Payable (A/P)',v_usmca,'accounts_payable'),
    ('2100','Driver Escrow - Held in Trust','Liability','Trust Accounts - Liabilities',v_usmca,'driver_escrow_liability'),
    ('2200','Driver Settlements Payable','Liability','Other Current Liabilities',v_usmca,NULL),
    ('2400','Equipment Loans / Notes Payable','Liability','Notes Payable',v_usmca,NULL),
    ('2600','IFTA / Sales Tax Payable','Liability','Sales Tax Payable',v_usmca,NULL),
    ('3000','Owner''s Capital / Contributions','Equity','Owner''s Equity',v_usmca,NULL),
    ('3100','Owner''s Draws','Equity','Partner Distributions',v_usmca,NULL),
    ('3900','Retained Earnings','Equity','Retained Earnings',v_usmca,'retained_earnings'),
    ('4000','Freight / Line-haul Income','Income','Service/Fee Income',v_usmca,NULL),
    ('4100','Fuel Surcharge Income','Income','Service/Fee Income',v_usmca,NULL),
    ('4200','Accessorial / Detention Income','Income','Service/Fee Income',v_usmca,NULL),
    ('5000','Fuel & Diesel','CostOfGoodsSold','Supplies & Materials - COGS',v_usmca,NULL),
    ('5100','Driver Pay / Settlements','CostOfGoodsSold','Cost of labor - COS',v_usmca,NULL),
    ('5300','Tolls & Scales','CostOfGoodsSold','Other Costs of Services - COS',v_usmca,NULL),
    ('5400','Truck Repairs & Maintenance','CostOfGoodsSold','Other Costs of Services - COS',v_usmca,NULL),
    ('5500','Tires','CostOfGoodsSold','Supplies & Materials - COGS',v_usmca,NULL),
    ('5600','Truck Insurance','CostOfGoodsSold','Other Costs of Services - COS',v_usmca,NULL),
    ('5700','Permits & Licenses (IFTA/IRP/DOT)','CostOfGoodsSold','Other Costs of Services - COS',v_usmca,NULL),
    ('6100','Telephone & Communications','Expense','Communication',v_usmca,NULL),
    ('6200','Legal & Professional Fees','Expense','Legal & Professional Fees',v_usmca,NULL),
    ('6300','Bank Service Charges & Wire Fees','Expense','Bank Charges',v_usmca,NULL),
    ('6310','Overdraft / NSF Fees','Expense','Bank Charges',v_usmca,NULL),
    ('6400','Factoring Fees','Expense','Bank Charges',v_usmca,NULL),
    ('6500','Software & Subscriptions','Expense','Dues & subscriptions',v_usmca,NULL),
    ('6900','Miscellaneous','Expense','Other Miscellaneous Service Cost',v_usmca,NULL),
    ('8000','Inter-company - IH35 Transportation','Asset','Other Current Assets',v_usmca,'intercompany_ih35'),
    ('9000','Ask My Accountant','Expense','Other Miscellaneous Service Cost',v_usmca,'ask_my_accountant')
  ON CONFLICT (operating_company_id, account_number) DO NOTHING;
END$$;

COMMIT;
