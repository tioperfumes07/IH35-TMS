-- [FINANCIAL CLUSTER] USMCA chart completion — accessorial revenue accounts, the 6 revenue maps,
-- the driver-damage CONTRA account + damage_recovery repoint, and the NULL Insurance Expense number.
-- Owner-directed 2026-08-02; agent Neon-apply authorized (CPA ANSWERS H2, owner reaffirmed in chat).
-- POSTS NOTHING. No GL math, no posting-flag flip, no QBO write-back. Additive (Rule 07).
--
-- SCOPE IS DELIBERATELY SMALLER THAN REQUESTED, because most of it already exists. Verified live on
-- br-fancy-credit-akjnd07a (positive control mdata.vendors=2,827) — USMCA ALREADY has, and this
-- migration does NOT duplicate: 5000 Fuel & Diesel · 5300 Tolls & Scales · DRIVERTRIPLU056412 Driver
-- Trip-Lumper Reimbursement · 5100 Driver Pay / Settlements · 6890 Cost of Labor–Mexico Drivers ·
-- 2100 Driver Escrow - Held in Trust (Liability, system_purpose=driver_escrow_liability) · 4000
-- Line-haul · 4100 Fuel Surcharge · 4200 Accessorial/Detention. Re-creating any of those would mint
-- near-twins into a chart that already resolves — the C2 near-twin rule forbids it.
--
-- §1 Accessorial revenue accounts 4210/4220/4230/4240 (4200 stays as Accessorial/Other — kept, never
--    renamed or repurposed).
-- §2 The 6 revenue category maps. USMCA has ZERO today (TRANSP has 6) — verified live — so creating
--    an invoice from a load in USMCA THROWS ExpenseCategoryMapResolutionError on its first line
--    (resolveAccountForCategory has no row to resolve and from-load.ts does not catch it). This is
--    the actual blocker for the seed battery's invoice phase.
-- §3 USMCA "Driver Accident Damages & Repairs" CONTRA-EXPENSE account + repoint damage_recovery.
-- §4 Backfill the NULL account_number on USMCA "Insurance Expense".
--
-- WHY NOT ON CONFLICT: chart_of_accounts_roles' unique index is PARTIAL
-- (uq_coa_roles_company_role_active ... WHERE is_active = true) and Postgres cannot infer a partial
-- index from a bare ON CONFLICT — it raises the same "no unique or exclusion constraint matching"
-- error that kept vendors_pull red until PR #3993. Everything below is NOT EXISTS-guarded.
--
-- WHY THE PER-ENTITY set_config: accounting.chart_of_accounts_roles' RLS WITH CHECK is
-- (operating_company_id = current_setting('app.operating_company_id')) with NO is_lucia_bypass()
-- branch, so a write fails regardless of app.bypass_rls unless the GUC names this entity.
-- catalogs.accounts' WITH CHECK DOES carry the bypass branch — the two are not symmetric.

BEGIN;

DO $$
DECLARE
  v_opco uuid;
  v_acct uuid;
  r RECORD;
BEGIN
  SELECT id INTO v_opco FROM org.companies WHERE code = 'USMCA';
  IF v_opco IS NULL THEN
    RAISE EXCEPTION 'USMCA operating company not found — refusing to seed blind';
  END IF;
  PERFORM set_config('app.operating_company_id', v_opco::text, true);

  -- §1 — accessorial revenue accounts -------------------------------------------------------------
  FOR r IN
    SELECT * FROM (VALUES
      ('4210', 'Detention Income'),
      ('4220', 'Layover Income'),
      ('4230', 'Lumper Income'),
      ('4240', 'TONU Income')
    ) AS t(num, nm)
  LOOP
    INSERT INTO catalogs.accounts (
      operating_company_id, account_number, account_name, account_type, account_subtype, is_postable
    )
    SELECT v_opco, r.num, r.nm, 'Income', 'Service/Fee Income', true
    WHERE NOT EXISTS (
      SELECT 1 FROM catalogs.accounts a
      WHERE a.operating_company_id = v_opco
        AND a.deactivated_at IS NULL
        AND (a.account_number = r.num OR a.account_name = r.nm)
    );
  END LOOP;

  -- §2 — the 6 revenue category maps ---------------------------------------------------------------
  -- Codes are exactly what deriveRevenueCode() emits (invoice-line-revenue-resolution.service.ts:22-34),
  -- read from the function, not guessed: linehaul · fuel_surcharge · detention · layover · lumper ·
  -- accessorial. posting_side='credit' — revenue credits.
  --
  -- NOTE ON 4240: deriveRevenueCode maps line_type 'tonu' -> code 'accessorial', so there is no
  -- 'tonu' CODE to map. 4240 is created above per the owner's chart request and is reachable by an
  -- explicit invoice_line.revenue_code='tonu' only if that code is added to the resolver. Recorded
  -- rather than silently mapping 'accessorial' at it, which would misroute every accessorial.
  IF to_regclass('accounting.expense_category_account_map') IS NULL THEN
    RAISE EXCEPTION 'accounting.expense_category_account_map absent — cannot seed USMCA revenue maps';
  END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('linehaul',       '4000'),
      ('fuel_surcharge', '4100'),
      ('detention',      '4210'),
      ('layover',        '4220'),
      ('lumper',         '4230'),
      ('accessorial',    '4200')
    ) AS t(code, num)
  LOOP
    SELECT a.id INTO v_acct
    FROM catalogs.accounts a
    WHERE a.operating_company_id = v_opco
      AND a.account_number = r.num
      AND a.deactivated_at IS NULL
      AND a.is_postable = true
    LIMIT 1;

    IF v_acct IS NULL THEN
      RAISE EXCEPTION 'USMCA revenue account % missing for code % — refusing to map revenue blind', r.num, r.code;
    END IF;

    INSERT INTO accounting.expense_category_account_map (
      operating_company_id, category_kind, category_code, account_id, posting_side, is_active
    )
    SELECT v_opco, 'revenue', r.code, v_acct, 'credit', true
    WHERE NOT EXISTS (
      SELECT 1 FROM accounting.expense_category_account_map m
      WHERE m.operating_company_id = v_opco
        AND m.category_kind = 'revenue'
        AND m.category_code = r.code
        AND m.is_active = true
    );
  END LOOP;

  -- §3 — driver-damage CONTRA-EXPENSE account + damage_recovery repoint -----------------------------
  -- Mirrors TRANSP QBO-1150040091 "Driver Accident Damages & Repairs" (OtherExpense/VehicleRepairs)
  -- BY PURPOSE, never by FK — a USMCA role row must never point at a TRANSP account.
  -- Owner ruling 2026-07-23 (migration 202607800000): driver-damage recovery is a RECOVERY against a
  -- recorded loss — CONTRA-EXPENSE, NEVER income. USMCA's damage_recovery currently resolves to
  -- 5400 "Truck Repairs & Maintenance" (CostOfGoodsSold), so a driver recovery credits general repair
  -- COGS and contaminates real truck-repair cost. The inactive Income account DRIVERRECOVE488409
  -- "Driver-Recovery-Damage" is deliberately NOT used — the ruling forbids income treatment.
  INSERT INTO catalogs.accounts (
    operating_company_id, account_number, account_name, account_type, account_subtype,
    system_purpose, is_postable, notes
  )
  SELECT v_opco, '6175', 'Driver Accident Damages & Repairs', 'OtherExpense', 'VehicleRepairs',
         'driver_damage_recovery', true,
         'CONTRA-EXPENSE. Records driver-caused damage and is CREDITED when recovered from the driver, '
         || 'so the recovery offsets the exact expense the damage created. NEVER income (owner ruling '
         || '2026-07-23). Mirrors TRANSP QBO-1150040091 by purpose.'
  WHERE NOT EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.operating_company_id = v_opco
      AND a.deactivated_at IS NULL
      AND (a.account_number = '6175'
           OR a.account_name = 'Driver Accident Damages & Repairs'
           OR a.system_purpose = 'driver_damage_recovery')
  );

  SELECT a.id INTO v_acct
  FROM catalogs.accounts a
  WHERE a.operating_company_id = v_opco
    AND a.account_number = '6175'
    AND a.deactivated_at IS NULL
    AND a.is_postable = true
  LIMIT 1;

  IF v_acct IS NULL THEN
    RAISE EXCEPTION 'USMCA 6175 damage contra account missing after seed — refusing to repoint blind';
  END IF;

  -- Void-not-delete: the wrong 5400 designation is DEACTIVATED, never removed, so the audit trail
  -- shows what it was and when it changed. The partial unique index only covers is_active=true rows,
  -- so deactivating first is what makes the new designation insertable.
  UPDATE accounting.chart_of_accounts_roles
  SET is_active = false, updated_at = now()
  WHERE operating_company_id = v_opco
    AND role = 'damage_recovery'
    AND is_active = true
    AND account_id <> v_acct;

  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  SELECT v_opco, 'damage_recovery', v_acct, true
  WHERE NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles x
    WHERE x.operating_company_id = v_opco
      AND x.role = 'damage_recovery'
      AND x.is_active = true
  );

  -- §4 — backfill the NULL account_number on USMCA "Insurance Expense" -----------------------------
  -- Distinct from 5600 "Truck Insurance" (vehicle policy cost); this is the general insurance expense
  -- line and was created without a number, so it sorts first and cannot be referenced by number.
  UPDATE catalogs.accounts
  SET account_number = '6600', updated_at = now()
  WHERE operating_company_id = v_opco
    AND account_name = 'Insurance Expense'
    AND account_number IS NULL
    AND deactivated_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM catalogs.accounts b
      WHERE b.operating_company_id = v_opco AND b.account_number = '6600'
    );
END $$;

COMMIT;
