-- [HOLD-FOR-JORGE — TIER 1] TRK sandbox chart of accounts seed. DO NOT RUN ON PROD.
-- INSERT on catalogs.accounts (financial cluster) → PROTECTED, gated. NEVER self-merge.
-- Runs on a Neon branch / the TRK sandbox under GUARD/Jorge; Jorge confirms the account list first.
--
-- WHY: TRK (IH35 Trucking, asset-holder) shows 0 accounts in Trial Balance and posting/settlements/
-- invoices can't post there. This seeds a lean STANDARD trucking COA scoped to TRK so the sandbox can
-- exercise the categorize→register→bill→post flow. Modeled on the proven USMCA seed (202606300060).
-- Opening balances are ZERO — owner-entered later (opening balances are owner-only).
--
-- SAFE-BY-CONFLICT: ON CONFLICT (operating_company_id, account_number) DO NOTHING. If TRK already has some
-- accounts (the USMCA-seed note recorded ~31), this only fills the MISSING standard account_numbers and
-- never duplicates. GUARD to confirm BEFORE running: (1) TRK's current catalogs.accounts count, and
-- (2) that the ANCHOR accounts carry the right system_purpose (resolvers look these up per-entity by
-- system_purpose — accounts_receivable / accounts_payable / driver_escrow_liability / retained_earnings /
-- undeposited_funds / bank_operating / ask_my_accountant / intercompany_ih35). If TRK already has an
-- account at the same number WITHOUT the system_purpose tag, this seed skips it (DO NOTHING) — GUARD then
-- UPDATEs system_purpose on the existing row rather than relying on this INSERT.
--
-- af1 note: catalogs.accounts is entity-RLS with FORCE. We SET app.operating_company_id = TRK so
-- accounts_entity_write's WITH CHECK accepts every insert. account_type is the 8-value COA enum;
-- account_subtype matches catalogs.detail_types names.

BEGIN;

DO $$
DECLARE
  v_trk uuid;
BEGIN
  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK';
  IF v_trk IS NULL THEN
    RAISE EXCEPTION 'TRK operating company not found in org.companies';
  END IF;

  -- scope the write so af1 FORCE RLS accepts the seed (all rows belong to TRK)
  PERFORM set_config('app.operating_company_id', v_trk::text, true);

  INSERT INTO catalogs.accounts
    (account_number, account_name, account_type, account_subtype, operating_company_id, system_purpose)
  VALUES
    ('1000','Bank of America - Operating (TRK)','Asset','Checking',v_trk,'bank_operating'),
    ('1090','Undeposited Funds','Asset','Undeposited Funds',v_trk,'undeposited_funds'),
    ('1100','Accounts Receivable (A/R)','Asset','Accounts Receivable (A/R)',v_trk,'accounts_receivable'),
    ('1200','Factoring Reserve / Holdback','Asset','Other Current Assets',v_trk,NULL),
    ('1500','Trucks & Tractors','Asset','Vehicles',v_trk,NULL),
    ('1510','Trailers','Asset','Vehicles',v_trk,NULL),
    ('1600','Accumulated Depreciation','Asset','Accumulated Depreciation',v_trk,NULL),
    ('2000','Accounts Payable (A/P)','Liability','Accounts Payable (A/P)',v_trk,'accounts_payable'),
    ('2100','Driver Escrow - Held in Trust','Liability','Trust Accounts - Liabilities',v_trk,'driver_escrow_liability'),
    ('2200','Driver Settlements Payable','Liability','Other Current Liabilities',v_trk,NULL),
    ('2400','Equipment Loans / Notes Payable','Liability','Notes Payable',v_trk,NULL),
    ('2600','IFTA / Sales Tax Payable','Liability','Sales Tax Payable',v_trk,NULL),
    ('3000','Owner''s Capital / Contributions','Equity','Owner''s Equity',v_trk,NULL),
    ('3100','Owner''s Draws','Equity','Partner Distributions',v_trk,NULL),
    ('3900','Retained Earnings','Equity','Retained Earnings',v_trk,'retained_earnings'),
    ('4000','Freight / Line-haul Income','Income','Service/Fee Income',v_trk,NULL),
    ('4100','Fuel Surcharge Income','Income','Service/Fee Income',v_trk,NULL),
    ('4200','Accessorial / Detention Income','Income','Service/Fee Income',v_trk,NULL),
    ('5000','Fuel & Diesel','CostOfGoodsSold','Supplies & Materials - COGS',v_trk,NULL),
    ('5100','Driver Pay / Settlements','CostOfGoodsSold','Cost of labor - COS',v_trk,NULL),
    ('5300','Tolls & Scales','CostOfGoodsSold','Other Costs of Services - COS',v_trk,NULL),
    ('5400','Truck Repairs & Maintenance','CostOfGoodsSold','Other Costs of Services - COS',v_trk,NULL),
    ('5500','Tires','CostOfGoodsSold','Supplies & Materials - COGS',v_trk,NULL),
    ('5600','Truck Insurance','CostOfGoodsSold','Other Costs of Services - COS',v_trk,NULL),
    ('5700','Permits & Licenses (IFTA/IRP/DOT)','CostOfGoodsSold','Other Costs of Services - COS',v_trk,NULL),
    ('6100','Telephone & Communications','Expense','Communication',v_trk,NULL),
    ('6200','Legal & Professional Fees','Expense','Legal & Professional Fees',v_trk,NULL),
    ('6300','Bank Service Charges & Wire Fees','Expense','Bank Charges',v_trk,NULL),
    ('6310','Overdraft / NSF Fees','Expense','Bank Charges',v_trk,NULL),
    ('6400','Factoring Fees','Expense','Bank Charges',v_trk,NULL),
    ('6500','Software & Subscriptions','Expense','Dues & subscriptions',v_trk,NULL),
    ('6900','Miscellaneous','Expense','Other Miscellaneous Service Cost',v_trk,NULL),
    ('8000','Inter-company - IH35 Transportation','Asset','Other Current Assets',v_trk,'intercompany_ih35'),
    ('9000','Ask My Accountant','Expense','Other Miscellaneous Service Cost',v_trk,'ask_my_accountant')
  ON CONFLICT (operating_company_id, account_number) DO NOTHING;
END$$;

COMMIT;
