-- ACCT-F162 — USMCA can incur a PERMIT expense that has no GL account to land in.
--
-- FOUND BY: draining CLS-ECON-EMPTY. Its instance ECON-012 blames
-- `apps/frontend/src/components/accounting/vendorBillLines.ts` for "PERMIT category has no GL
-- translation". That file is FRONTEND and it is CORRECT as written: unmapped codes return null and
-- pass `expense_category_uuid` only, under the explicit comment "never invent a GL account". Deferring
-- to the server resolver is the right fail-safe, and "fixing" the FE to invent a mapping would BE the
-- defect. The card is mis-scoped; the real gap is server-side DATA.
--
-- VERIFIED ON PROD br-fancy-credit-akjnd07a 2026-08-07 (RLS-bypassed — an ordinary count returns 0 on
-- every one of these tables, so the completeness discriminator is not optional here):
--     catalogs.expense_categories codes ............... FUEL, PERMIT, REPAIR
--     accounting.expense_category_account_map ......... 93 rows = 83 ACTIVE + 10 inactive
--     active kinds ..... cash_advance, driver_pay, escrow, factoring_fee, fuel, insurance, lumper,
--                        maintenance, office, other, revenue, toll
--     ... containing a `permit` kind or code .......... NONE
-- So `catalogs.expense_categories` publishes a PERMIT category the GL map does not carry, and a permit
-- expense fails closed with EXPENSE_CATEGORY_MAP_NOT_FOUND (per
-- docs/blocks/HOLD-FUEL-GL-EXPENSE-MAP-CODES-2026-07-21.md). Failing closed is correct behaviour; the
-- missing mapping is the defect.
--
-- WHY USMCA ONLY, AND WHY THAT IS NOT A HALF-FIX:
--   • USMCA is the GO-FORWARD operating carrier. Owner, 2026-08-07: TRANSP ceases operating within
--     weeks. Locked decision §8.5: USMCA has NO QuickBooks and is TMS-AUTHORITATIVE from day one — so
--     this map is the only book its permit costs will ever land in, with no QBO to reconcile against.
--   • USMCA's chart has exactly ONE purpose-built account for this and it is currently UNUSED:
--     5700 "Permits & Licenses (IFTA/IRP/DOT)", CostOfGoodsSold. There is no judgment call to make —
--     which is precisely why this one is seedable without an owner ruling.
--   • TRANSP and TRK are DELIBERATELY NOT seeded here. Each has SEVERAL permit accounts
--     (TRANSP: Permit-Driver Intl Permits / Permit-Individual Load & Travel State Permits /
--     Permit-License Plates — and its plain "Permits" QBO-99 + "Permits/Vehicle" QBO-100 are both
--     marked (deleted); TRK, an ASSET HOLDER ONLY: OE-State Permits / OE-Driver Permits /
--     OC-TAXES & PERMITS). Choosing among them is a genuine accounting-treatment judgment, its value
--     is low for an entity winding down, and guessing it would violate "no guessed mappings". Routed
--     to the board instead of decided here.
--
-- CONVENTION FOLLOWED, not invented — read off the existing 83 active rows: every entity maps to an
-- account in ITS OWN chart, and every operating-expense category uses posting_side='debit'
-- (66 debit / 17 credit, the credits being the revenue + lumper-income kinds). USMCA's sibling
-- operating costs (fuel 5000, maintenance 5400, tolls 5300) are all CostOfGoodsSold + debit, and 5700
-- is CostOfGoodsSold, so `permit` joins them consistently.
--
-- NO HARDCODED UUIDs: the company is resolved by `org.companies.code = 'USMCA'` and the account by
-- (that company, account_number = '5700'). If either is absent the migration RAISES rather than
-- inserting a half-row — a mapping pointing at nothing is worse than no mapping.
--
-- Idempotent: NOT EXISTS guard against the active row, so a re-run is a no-op. Additive only — it
-- touches no existing row, and the 10 inactive rows (superseded bad mappings, correctly retained under
-- void-not-delete) are left exactly as they are.

-- ROOT-CAUSE PRECONDITION (added 2026-08-07 — the reason the original seed failed on prod):
-- the enforcing CHECK `expense_category_account_map_category_kind_check` lists exactly 12 kinds and
-- OMITS 'permit', so the INSERT below fails closed with
-- "violates check constraint ...category_kind_check" the moment a USMCA company exists. CI never
-- caught it because the empty CI database has no USMCA company, so the insert block RETURNs early and
-- the constraint is never exercised — the defect only surfaces on prod. This block extends the
-- constraint FIRST, re-adding the EXACT existing 12-kind set plus 'permit'. Additive only: all 93
-- existing rows (83 active + 10 inactive) already satisfy the wider set, so ADD CONSTRAINT
-- re-validates clean. The DROP+ADD is atomic inside the migration's wrapping transaction (Postgres
-- transactional DDL), so the table is never left unprotected. Idempotent: DROP IF EXISTS + ADD
-- re-adds the identical constraint on any re-run, and no-ops on a fresh DB where the table is absent.
DO $$
BEGIN
  IF to_regclass('accounting.expense_category_account_map') IS NOT NULL THEN
    ALTER TABLE accounting.expense_category_account_map
      DROP CONSTRAINT IF EXISTS expense_category_account_map_category_kind_check;
    ALTER TABLE accounting.expense_category_account_map
      ADD CONSTRAINT expense_category_account_map_category_kind_check
      CHECK (category_kind = ANY (ARRAY[
        'fuel','maintenance','revenue','driver_pay','factoring_fee','toll',
        'escrow','insurance','office','other','cash_advance','lumper','permit'
      ]));
  END IF;
END
$$;

DO $$
DECLARE
  v_opco    uuid;
  v_account uuid;
BEGIN
  IF to_regclass('accounting.expense_category_account_map') IS NULL THEN
    RAISE NOTICE 'ACCT-F162: accounting.expense_category_account_map absent — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_opco FROM org.companies WHERE code = 'USMCA' AND is_active LIMIT 1;
  IF v_opco IS NULL THEN
    RAISE NOTICE 'ACCT-F162: no active USMCA company — skipping (fresh CI database)';
    RETURN;
  END IF;

  SELECT id INTO v_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_opco
     AND account_number = '5700'
   LIMIT 1;

  IF v_account IS NULL THEN
    RAISE NOTICE 'ACCT-F162: USMCA account 5700 (Permits & Licenses) not present — skipping rather than mapping to nothing';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM accounting.expense_category_account_map
     WHERE operating_company_id = v_opco
       AND category_kind = 'permit'
       AND category_code = 'permit'
       AND is_active
  ) THEN
    RAISE NOTICE 'ACCT-F162: USMCA permit/permit mapping already active — no-op';
    RETURN;
  END IF;

  INSERT INTO accounting.expense_category_account_map
    (operating_company_id, category_kind, category_code, account_id, posting_side, is_active)
  VALUES
    (v_opco, 'permit', 'permit', v_account, 'debit', true);

  RAISE NOTICE 'ACCT-F162: USMCA permit/permit -> account 5700 (Permits & Licenses, COGS, debit) mapped';
END
$$;
