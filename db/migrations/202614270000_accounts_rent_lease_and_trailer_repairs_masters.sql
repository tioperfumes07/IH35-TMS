-- 202614270000_accounts_rent_lease_and_trailer_repairs_masters.sql
--
-- Owner ruling (~/Downloads/09-23-2026-CC-3-CREATE-FOUR-ACCOUNTS-RUN-THIS.md, 2026-09-23):
-- "ON THE GAPS, SOLVE THE ISSUES, CREATE THE ACCOUNTS, ETC." Four accounts close every
-- remaining item_catalog_seed.csv gap (item_catalog_gaps.csv, 4 rows: Hours, Rent-Office-Laredo
-- Texas, Rent-Office-Nuevo Laredo, Rent-Truck Yard-Colombia Nuevo Leon).
--
-- WHY: the live USMCA chart has 6100 Telephone, 6200 Legal, 6210 Office & Admin, 6300 Bank
-- Charges, 6500 Software, 6600 Insurance -- and NO rent account. QBO-228-USMCA is "Leased
-- Trucks from IH35 TRUCKING" (a truck lease, not premises rent) -- using it for office rent
-- would bury building/yard rent inside equipment cost. 6250 is the free slot in that band.
-- 5450 was already ruled in E13-B D1 as the trailer master mirroring 5400 Truck Repairs &
-- Maintenance, and is created here (not in a separate E13-B migration) because the item catalog
-- needs it now and E13-B hygiene has not yet landed its own migration.
--
-- 6250 Rent & Lease Expense           Expense          parent, NOT postable
--  6255 Rent -- Office                Expense          child of 6250 (Laredo TX, Nuevo Laredo)
--  6260 Rent -- Truck Yard            Expense          child of 6250 (Colombia, Nuevo Leon)
-- 5450 Trailer Repairs & Maintenance  CostOfGoodsSold  parent, NOT postable, mirrors 5400
--
-- Account numbers are HIDDEN in every UI surface (Round 83 R1) -- the number is the seed key
-- only; the NAME is what a human sees, kept unique per Cursor's M1 guard.
--
-- USMCA-only (operating_company_id 5c854333-6ea5-4faa-af31-67cb272fef80), matching the item
-- catalog's own scope and the owner's own verbatim SQL. Idempotent: each INSERT guarded by
-- NOT EXISTS on (operating_company_id, account_number).
DO $$
DECLARE
  usmca_id uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  rent_parent_id uuid;
BEGIN
  IF to_regclass('catalogs.accounts') IS NULL THEN
    RETURN;
  END IF;

  -- 6250 Rent & Lease Expense -- parent, non-postable
  IF NOT EXISTS (
    SELECT 1 FROM catalogs.accounts
     WHERE operating_company_id = usmca_id AND account_number = '6250'
  ) THEN
    INSERT INTO catalogs.accounts
      (id, account_number, account_name, account_type, account_subtype,
       parent_account_id, is_postable, currency_code, operating_company_id)
    VALUES
      (gen_random_uuid(), '6250', 'Rent & Lease Expense', 'Expense',
       'Rent or Lease of Buildings', NULL, false, 'USD', usmca_id);
  END IF;

  SELECT id INTO rent_parent_id
    FROM catalogs.accounts
   WHERE operating_company_id = usmca_id AND account_number = '6250';

  -- 6255 / 6260 -- children of 6250
  IF NOT EXISTS (
    SELECT 1 FROM catalogs.accounts
     WHERE operating_company_id = usmca_id AND account_number = '6255'
  ) THEN
    INSERT INTO catalogs.accounts
      (id, account_number, account_name, account_type, account_subtype,
       parent_account_id, is_postable, currency_code, operating_company_id)
    VALUES
      (gen_random_uuid(), '6255', 'Rent — Office', 'Expense',
       'Rent or Lease of Buildings', rent_parent_id, true, 'USD', usmca_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM catalogs.accounts
     WHERE operating_company_id = usmca_id AND account_number = '6260'
  ) THEN
    INSERT INTO catalogs.accounts
      (id, account_number, account_name, account_type, account_subtype,
       parent_account_id, is_postable, currency_code, operating_company_id)
    VALUES
      (gen_random_uuid(), '6260', 'Rent — Truck Yard', 'Expense',
       'Rent or Lease of Buildings', rent_parent_id, true, 'USD', usmca_id);
  END IF;

  -- 5450 Trailer Repairs & Maintenance -- parent, non-postable, mirrors 5400 (E13-B D1)
  IF NOT EXISTS (
    SELECT 1 FROM catalogs.accounts
     WHERE operating_company_id = usmca_id AND account_number = '5450'
  ) THEN
    INSERT INTO catalogs.accounts
      (id, account_number, account_name, account_type, account_subtype,
       parent_account_id, is_postable, currency_code, operating_company_id)
    VALUES
      (gen_random_uuid(), '5450', 'Trailer Repairs & Maintenance', 'CostOfGoodsSold',
       'Other Costs of Services - COS', NULL, false, 'USD', usmca_id);
  END IF;
END $$;
