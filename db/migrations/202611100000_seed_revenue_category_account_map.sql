-- ACCT-F74 — seed accounting.expense_category_account_map with category_kind='revenue'.
--
-- WHY: creating an invoice from a load is COMPLETELY BROKEN today. The chain is
--   from-load.ts -> resolveInvoiceLineRevenueAccountId({line_type}) -> deriveRevenueCode()
--   -> resolveAccountForCategory(opco, 'revenue', <code>) -> accounting.expense_category_account_map
-- and that table holds ZERO rows with category_kind='revenue' for ANY entity (verified on prod
-- 2026-08-01: 37 rows total, complete read visible 37 == n_live_tup 37 == n_tup_ins 37; kinds present
-- are cash_advance, driver_pay, escrow, factoring_fee, fuel, insurance, lumper, maintenance, office,
-- other, toll). resolveAccountForCategory THROWS ExpenseCategoryMapResolutionError on a miss and
-- from-load calls it outside any try/catch, so the invoice fails on its very first line.
--
-- This is NOT the catalogs.items mapping it first appeared to be: the load->invoice flow never reads
-- catalogs.items at all — it writes invoice_lines.account_id directly, and buildInvoiceLines prefers
-- that explicit account over any item default. Mapping the TMS-native items would have changed
-- nothing.
--
-- TRANSP ONLY — AND THAT IS A DELIBERATE, VERIFIED SCOPE, NOT AN OMISSION:
--   account_number 'QBO-31' resolves to DIFFERENT accounts per entity —
--     TRANSP  QBO-31 = "Sales of Product Income"            (revenue — correct)
--     TRK     QBO-31 = "COST OF SALES-OPERATING COSTS"      (an EXPENSE account)
--   Seeding entity-blind by account_number would credit TRK revenue into cost of sales. QBO-1150040184
--   and QBO-1150040160 exist ONLY for TRANSP, and USMCA has none of the three. TRANSP is also the
--   entity that invoices customers. TRK earns rental income through the lease bridge, not freight
--   revenue, and gets its own mapping when that lands.
--
-- ACCOUNTS (each is the SAME income account its already-mapped QBO twin item uses, so TMS ties to QBO
-- under parallel-books):
--   linehaul        -> QBO-31           Sales of Product Income                    (twin: Line Haul [QBO 1])
--   fuel_surcharge  -> QBO-31           Sales of Product Income                    (twin: Fuel Surcharge [QBO 24])
--   detention       -> QBO-1150040184   Sales-Income-From Layover, Shag, ...       (twin: Sales-Detention Charge [QBO 43])
--   layover         -> QBO-1150040184   Sales-Income-From Layover, Shag, ...       (twin: Layover Charge [QBO 26])
--   lumper          -> QBO-1150040160   Sales-Warehouse-Lumper Fee-Income          (twin: Warehouse-Lumper Fee [QBO 6])
--   accessorial     -> QBO-1150040184   Sales-Income-From Layover, Shag, ...       (TONU + accessorial; RATIFIED by owner)
-- These are exactly the codes deriveRevenueCode() emits — verified against the function, not guessed.
--
-- SAFETY: idempotent (NOT EXISTS guard per row, no reliance on a unique constraint), additive, no
-- DELETE, entity-scoped, posting_side='credit' (revenue credits). Accounts are resolved BY NUMBER
-- within TRANSP and must be active + postable, so a missing/deactivated account seeds nothing rather
-- than pointing revenue at a wrong row. No hardcoded UUIDs.

DO $$
DECLARE
  v_opco uuid;
  r RECORD;
  v_account uuid;
BEGIN
  IF to_regclass('accounting.expense_category_account_map') IS NULL THEN
    RAISE NOTICE 'expense_category_account_map absent — skipping ACCT-F74 seed';
    RETURN;
  END IF;

  SELECT id INTO v_opco FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_opco IS NULL THEN
    RAISE NOTICE 'TRANSP not found — skipping ACCT-F74 seed';
    RETURN;
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('linehaul',       'QBO-31'),
      ('fuel_surcharge', 'QBO-31'),
      ('detention',      'QBO-1150040184'),
      ('layover',        'QBO-1150040184'),
      ('lumper',         'QBO-1150040160'),
      ('accessorial',    'QBO-1150040184')
    ) AS t(category_code, account_number)
  LOOP
    SELECT a.id INTO v_account
      FROM catalogs.accounts a
     WHERE a.operating_company_id = v_opco
       AND a.account_number = r.account_number
       AND a.deactivated_at IS NULL
       AND a.is_postable = true
     LIMIT 1;

    IF v_account IS NULL THEN
      RAISE NOTICE 'ACCT-F74: account % not found/active for TRANSP — skipping %', r.account_number, r.category_code;
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM accounting.expense_category_account_map m
       WHERE m.operating_company_id = v_opco
         AND m.category_kind = 'revenue'
         AND m.category_code = r.category_code
    ) THEN
      INSERT INTO accounting.expense_category_account_map
        (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
      VALUES (v_opco, 'revenue', r.category_code, v_account, 'credit', true);
    END IF;
  END LOOP;
END $$;
