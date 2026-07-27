-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] Intercompany COA 8000-block seed (BANK-DOM-05 foundation).
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. POSTS NOTHING. ***
--
-- PROD TRUTH 2026-07-26 (lucia): all 6 pair accounts already exist (owner-batch). This migration makes
-- the seed REPRODUCIBLE on fresh DBs and idempotent on prod (NOT EXISTS guards). Pattern locked:
-- one "Inter-company - <Counterparty>" Asset / OtherCurrentAsset per entity per counterparty,
-- system_purpose intercompany_<code>. NEVER invent Due-to/Due-from (C2 split-brain).
-- Resolve companies BY CODE — never hardcode UUIDs.

BEGIN;

DO $$
DECLARE
  v_transp uuid;
  v_trk uuid;
  v_usmca uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  SELECT id INTO v_trk FROM org.companies WHERE code = 'TRK' LIMIT 1;
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' LIMIT 1;

  IF v_transp IS NULL OR v_trk IS NULL OR v_usmca IS NULL THEN
    RAISE NOTICE 'intercompany COA seed: missing company row(s) — skip';
    RETURN;
  END IF;

  -- TRANSP → TRK (8001), TRANSP → USMCA (8002)
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_transp, '8001', 'Inter-company - IH35 Trucking', 'Asset', 'Other Current Assets',
         'intercompany_trk', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_transp AND a.deactivated_at IS NULL
      AND (a.account_number = '8001' OR a.system_purpose = 'intercompany_trk')
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_transp, '8002', 'Inter-company - USMCA Freight', 'Asset', 'Other Current Assets',
         'intercompany_usmca', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_transp AND a.deactivated_at IS NULL
      AND (a.account_number = '8002' OR a.system_purpose = 'intercompany_usmca')
  );

  -- TRK → TRANSP (8000), TRK → USMCA (8002)
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_trk, '8000', 'Inter-company - IH35 Transportation', 'Asset', 'Other Current Assets',
         'intercompany_transp', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_trk AND a.deactivated_at IS NULL
      AND (a.account_number = '8000' OR a.system_purpose = 'intercompany_transp')
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_trk, '8002', 'Inter-company - USMCA Freight', 'Asset', 'Other Current Assets',
         'intercompany_usmca', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_trk AND a.deactivated_at IS NULL
      AND (a.account_number = '8002' OR a.system_purpose = 'intercompany_usmca')
  );

  -- USMCA → TRANSP (8000 / intercompany_ih35 legacy purpose), USMCA → TRK (8001)
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_usmca, '8000', 'Inter-company - IH35 Transportation', 'Asset', 'Other Current Assets',
         'intercompany_ih35', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.deactivated_at IS NULL
      AND (a.account_number = '8000' OR a.system_purpose IN ('intercompany_ih35', 'intercompany_transp'))
  );

  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable
  )
  SELECT v_usmca, '8001', 'Inter-company - IH35 Trucking', 'Asset', 'Other Current Assets',
         'intercompany_trk', true
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.deactivated_at IS NULL
      AND (a.account_number = '8001' OR a.system_purpose = 'intercompany_trk')
  );
END
$$;

COMMIT;
