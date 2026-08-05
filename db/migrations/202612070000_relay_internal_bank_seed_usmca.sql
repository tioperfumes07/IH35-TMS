-- CONN-3 Part B — extend the Relay internal-bank master data to USMCA.
--
-- WHY
-- USMCA is beginning to use Relay (owner, 2026-08-04). The CONN-3 design
-- (docs/specs/conn3-relay-internal-bank-design.md) models the pre-funded Relay wallet as an ASSET per
-- operating company — deposits DEBIT it, fuel draws AND fees CREDIT it, and its balance is the control
-- that reconciles to Relay's reported wallet balance. Migration 202607290000 seeded that master data for
-- TRANSP only. Verified on prod before writing this: account 1295 / system_purpose='relay_fuel_wallet'
-- and all five RELAY-* items exist for TRANSP and for NO other entity. So the moment USMCA pumps a
-- gallon, stage 2 has no wallet to credit and no item to price the draw against.
--
-- WHAT THIS FIXES IN THE ORIGINAL SEED (and why it is not a copy-paste)
-- 202607290000 guarded the account with a GLOBAL `NOT EXISTS (... WHERE account_number = '1295')`. That
-- was safe when only TRANSP existed, but the chart of accounts is PER ENTITY — every operating company
-- carries its own 1295 — so re-running that predicate now finds TRANSP's row and silently seeds nothing
-- for anyone else. This migration scopes every existence check to the entity, which is the correct
-- multi-entity shape and the reason USMCA was never covered by simply re-running the original.
--
-- SCOPE: USMCA only. TRK is deliberately NOT seeded — it is the asset holder (0 fuel transactions,
-- 0 loads, 0 invoices on prod; owner ruling: TRK leases equipment and does not factor or haul), so
-- giving it a fuel wallet would invent structure for business it does not do.
--
-- MASTER DATA ONLY — no posting layer, no flag, no GL is written here, exactly as the TRANSP seed did.
-- Additive and idempotent.

BEGIN;

-- ── 1. Relay Fuel Wallet asset account (catalogs.accounts) — USMCA ──
DO $$
DECLARE
  v_usmca uuid;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'CONN-3: USMCA absent (fresh CI DB) — skipping Relay wallet seed (0 rows).';
    RETURN;
  END IF;

  PERFORM set_config('app.operating_company_id', v_usmca::text, true);

  INSERT INTO catalogs.accounts
    (account_number, account_name, account_type, account_subtype, operating_company_id, system_purpose, notes)
  SELECT '1295', 'Relay Fuel Wallet', 'Asset', 'Other Current Assets', v_usmca, 'relay_fuel_wallet',
         'Prepaid Relay fuel wallet (clearing/asset). Deposits debit; fuel draws + fees credit. Balance reconciles to Relay reported wallet balance. CONN-3 Part B. Nothing posts until owner sign-off.'
  -- Entity-scoped on BOTH predicates: the chart of accounts is per operating company, so TRANSP already
  -- holding 1295 must not block USMCA from holding its own.
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.system_purpose = 'relay_fuel_wallet'
  )
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_usmca AND a.account_number = '1295'
  );
END$$;

-- ── 2. Relay fuel product/services + fee items (catalogs.items) — USMCA ──
-- The two fee items are the owner's point that Relay is also a VENDOR: every fuel transaction carries a
-- bank fee and a fuel fee leg, and per the design both CREDIT the wallet alongside the fuel draw rather
-- than arriving separately as a bank charge to categorize.
DO $$
DECLARE
  v_usmca uuid;
  v_has_opco boolean;
BEGIN
  SELECT id INTO v_usmca FROM org.companies WHERE code = 'USMCA' LIMIT 1;
  IF v_usmca IS NULL THEN
    RAISE NOTICE 'CONN-3: USMCA absent — skipping Relay item seed (0 rows).';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'catalogs' AND table_name = 'items' AND column_name = 'operating_company_id'
  ) INTO v_has_opco;

  PERFORM set_config('app.operating_company_id', v_usmca::text, true);

  IF v_has_opco THEN
    INSERT INTO catalogs.items
      (operating_company_id, item_name, item_code, item_type, description, taxable)
    SELECT v_usmca, x.name, x.code, x.itype, x.descr, false
    FROM (VALUES
      ('Relay Diesel (per gallon)',      'RELAY-DIESEL',   'NonInventory', 'Diesel pumped via Relay — cost-per-gallon x gallons (Relay CSV line decomposition). Fuel draw credits Relay Fuel Wallet. Expense account resolved at booking time.'),
      ('Relay DEF (per gallon)',         'RELAY-DEF',      'NonInventory', 'DEF pumped via Relay — cost-per-gallon x gallons. Fuel draw credits Relay Fuel Wallet.'),
      ('Relay Reefer Fuel (per gallon)', 'RELAY-REEFER',   'NonInventory', 'Reefer fuel pumped via Relay — cost-per-gallon x gallons. Fuel draw credits Relay Fuel Wallet.'),
      ('Relay Bank Fee',                 'RELAY-FEE-BANK', 'Service',      'Relay per-transaction bank fee. Credits Relay Fuel Wallet; expensed to Bank Charges at booking time.'),
      ('Relay Fuel/Diesel Fee',          'RELAY-FEE-FUEL', 'Service',      'Relay per-transaction fuel/diesel fee. Credits Relay Fuel Wallet; expensed to Fuel Fees at booking time.')
    ) AS x(name, code, itype, descr)
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogs.items i WHERE i.operating_company_id = v_usmca AND i.item_code = x.code
    );
  ELSE
    -- Pre-AF-2 shape: items are not entity-scoped, so TRANSP's rows already serve every entity and
    -- re-seeding by bare item_code would create duplicates. Nothing to do.
    RAISE NOTICE 'CONN-3: catalogs.items has no operating_company_id — TRANSP rows already serve all entities; skipping.';
  END IF;
END$$;

COMMIT;
