-- [HOLD-FOR-JORGE — FINANCIAL] CONN-3 — Relay as its own internal bank (Part B), master-data SEED only.
--
-- *** DO NOT RUN ON PROD. DO NOT MERGE. *** BUILT-AND-HELD per constitution §1.4: this INSERTs into
-- catalogs.accounts (financial cluster) — run ONLY on a Neon branch by Jorge's hand, then ledger-backfilled
-- so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
--
-- SCOPE (design: docs/specs/conn3-relay-internal-bank-design.md; recon:
-- docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md). This is the conservative, reviewable Part-B
-- increment: it seeds the ACCOUNT MODEL only — no posting, no GL math, no flags.
--   (1) catalogs.accounts: one "Relay Fuel Wallet" account per operating company — an Other-Current-Asset
--       (bank-type) clearing account. Deposits DEBIT it (fund the wallet); fuel draws CREDIT it (pump).
--       Its balance reconciles to Relay's reported wallet balance — a control account, NOT an expense.
--   (2) catalogs.items: Diesel / DEF / Reefer Fuel as itemized product/services (cost-per-gallon × gallons,
--       mirroring the Relay CSV line decomposition) + the two Relay fee items (bank fee, fuel/diesel fee).
--
-- WHAT THIS DOES NOT DO (still HOLD-FOR-JORGE — the deferred booking build, needs owner sign-off):
--   * NO GL/JE posting. NO booking of deposits (company cash vs Loan-from-Owner / Capital) or fuel draws.
--     Nothing here posts; there is no posted_to_gl column on master-data rows and no flag is flipped.
--   * The item -> fuel-expense-account mapping is deliberately LEFT NULL here — it is resolved at booking
--     time by the EXISTING fuel expense-mapping (accounting.expense_category_account_map resolver +
--     AF-2b item->account backfill infra). We reuse that; we invent no GL math (design doc §2, §4).
--   * The three layers stay separate and are NEVER summed: fuel pumped (type=code) vs funded into Relay
--     (type=deposit, the wallet DEBITs) vs paid to Relay from the bank (banking.bank_transactions).
--
-- CANONICAL TABLES ONLY (LINKAGE-LAW): writes catalogs.accounts + catalogs.items, reads org.companies.
-- No RETIRE table (no accounting.qbo_*, bank.*, settlement.*, payroll.*, maint.*).
-- Idempotent (NOT EXISTS guards), additive-only, void-not-delete (deactivated_at, never DELETE),
-- FK-safe on a fresh CI DB (TRANSP resolved by stable code; seeds 0 rows if absent instead of RAISE-ing).
-- Account number 1295 chosen as a free Other-Current-Asset slot; the global NOT-EXISTS guard makes it
-- collision-proof — Jorge confirms/adjusts on the Neon branch before prod (usmca_coa_seed precedent).

BEGIN;

-- ── 1. Relay Fuel Wallet account (Other Current Asset) per operating company — seed TRANSP ──
-- operating_company_id + system_purpose are committed columns (202606161000 stage1) present on prod.
-- FORCE entity-RLS on catalogs.accounts (AF-1) is satisfied by scoping app.operating_company_id below.
DO $$
DECLARE
  v_transp uuid;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'CONN-3: TRANSP absent (fresh CI DB) — skipping Relay Fuel Wallet account seed (0 rows).';
    RETURN;
  END IF;

  -- scope the write so catalogs.accounts FORCE RLS (AF-1) WITH CHECK accepts the row (usmca_coa_seed pattern)
  PERFORM set_config('app.operating_company_id', v_transp::text, true);

  -- Idempotent + collision-proof: skip if this company already has a relay_fuel_wallet, OR if account
  -- number 1295 is already taken (guards the pre-AF-1 GLOBAL account_number unique still live on prod).
  INSERT INTO catalogs.accounts
    (account_number, account_name, account_type, account_subtype, operating_company_id, system_purpose, notes)
  SELECT '1295', 'Relay Fuel Wallet', 'Asset', 'Other Current Assets', v_transp, 'relay_fuel_wallet',
         'Prepaid Relay fuel wallet (clearing/asset). Deposits debit; fuel draws + fees credit. Balance reconciles to Relay reported wallet balance. CONN-3 Part B. Nothing posts until owner sign-off.'
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_transp AND a.system_purpose = 'relay_fuel_wallet'
  )
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a WHERE a.account_number = '1295'
  );
END$$;

-- ── 2. Relay fuel product/services + fee items (catalogs.items) — seed TRANSP ──
-- catalogs.items.operating_company_id is added by AF-2 (HELD): present + NOT NULL on a fresh CI DB / any
-- Neon branch where AF-2 has run, ABSENT on prod-today. Branch on column presence so the seed is valid in
-- BOTH states. Distinctive RELAY-* item codes avoid any collision with existing item master rows.
DO $$
DECLARE
  v_transp uuid;
  v_has_opco boolean;
BEGIN
  SELECT id INTO v_transp FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_transp IS NULL THEN
    RAISE NOTICE 'CONN-3: TRANSP absent (fresh CI DB) — skipping Relay product/service item seed (0 rows).';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalogs' AND table_name = 'items' AND column_name = 'operating_company_id'
  ) INTO v_has_opco;

  -- scope RLS (harmless if catalogs.items has no forced RLS on this branch)
  PERFORM set_config('app.operating_company_id', v_transp::text, true);

  IF v_has_opco THEN
    INSERT INTO catalogs.items
      (operating_company_id, item_name, item_code, item_type, description, taxable)
    SELECT v_transp, x.name, x.code, x.itype, x.descr, false
    FROM (VALUES
      ('Relay Diesel (per gallon)',      'RELAY-DIESEL',   'NonInventory', 'Diesel pumped via Relay — cost-per-gallon x gallons (Relay CSV line decomposition). Fuel draw credits Relay Fuel Wallet. Expense account resolved at booking time.'),
      ('Relay DEF (per gallon)',         'RELAY-DEF',      'NonInventory', 'DEF pumped via Relay — cost-per-gallon x gallons. Fuel draw credits Relay Fuel Wallet.'),
      ('Relay Reefer Fuel (per gallon)', 'RELAY-REEFER',   'NonInventory', 'Reefer fuel pumped via Relay — cost-per-gallon x gallons. Fuel draw credits Relay Fuel Wallet.'),
      ('Relay Bank Fee',                 'RELAY-FEE-BANK', 'Service',      'Relay per-transaction bank fee. Credits Relay Fuel Wallet; expensed to Bank Charges at booking time.'),
      ('Relay Fuel/Diesel Fee',          'RELAY-FEE-FUEL', 'Service',      'Relay per-transaction fuel/diesel fee. Credits Relay Fuel Wallet; expensed to Fuel Fees at booking time.')
    ) AS x(name, code, itype, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogs.items i WHERE i.operating_company_id = v_transp AND i.item_code = x.code
    );
  ELSE
    INSERT INTO catalogs.items
      (item_name, item_code, item_type, description, taxable)
    SELECT x.name, x.code, x.itype, x.descr, false
    FROM (VALUES
      ('Relay Diesel (per gallon)',      'RELAY-DIESEL',   'NonInventory', 'Diesel pumped via Relay — cost-per-gallon x gallons (Relay CSV line decomposition). Fuel draw credits Relay Fuel Wallet. Expense account resolved at booking time.'),
      ('Relay DEF (per gallon)',         'RELAY-DEF',      'NonInventory', 'DEF pumped via Relay — cost-per-gallon x gallons. Fuel draw credits Relay Fuel Wallet.'),
      ('Relay Reefer Fuel (per gallon)', 'RELAY-REEFER',   'NonInventory', 'Reefer fuel pumped via Relay — cost-per-gallon x gallons. Fuel draw credits Relay Fuel Wallet.'),
      ('Relay Bank Fee',                 'RELAY-FEE-BANK', 'Service',      'Relay per-transaction bank fee. Credits Relay Fuel Wallet; expensed to Bank Charges at booking time.'),
      ('Relay Fuel/Diesel Fee',          'RELAY-FEE-FUEL', 'Service',      'Relay per-transaction fuel/diesel fee. Credits Relay Fuel Wallet; expensed to Fuel Fees at booking time.')
    ) AS x(name, code, itype, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogs.items i WHERE i.item_code = x.code
    );
  END IF;
END$$;

COMMIT;
