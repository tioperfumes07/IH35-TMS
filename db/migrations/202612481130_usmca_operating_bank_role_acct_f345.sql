-- FINDING: ACCT-F345 — a driver cash advance credited "Undeposited Funds", so money LEAVING the
-- business was booked to the account that holds money RECEIVED but not yet deposited.
--
-- SYMPTOM, measured on prod br-fancy-credit-akjnd07a (bypass_rls='lucia' as its own statement):
--   catalogs.accounts 1090 "Undeposited Funds" (USMCA) net = -350.00 — a CREDIT balance on an ASSET.
--   Entirely from two driver advances: 2239fa7f ($250.00, ALFONSO HIDALGO CHAVEZ, 2026-08-07) and
--   adfabf6d ($100.00, SAMPLE Cascade-2042, 2026-08-08). The customer-payment traffic through 1090
--   (PMT-2026-00004/00005, posted and void-reversed) nets to 0 correctly — none of the -350 is receipts.
--
-- ROOT CAUSE, and it is TWO faults compounding:
--   (1) posting-engine.service.ts resolveCashLikeAccountForCompany() returns undeposited_funds, then
--       cash_clearing. Both are RECEIPT-side clearing accounts. buildDriverAdvanceLines /
--       buildDriverReimbursementLines / buildCashAdvanceLines credited it whenever the operator did
--       not pick a source account — wrong DIRECTION by definition.
--   (2) THE FALLBACK WAS NOT A FALLBACK. On USMCA both roles resolve to the SAME account:
--         undeposited_funds -> 1090 Undeposited Funds
--         cash_clearing     -> 1090 Undeposited Funds
--       so there was NO configuration in which an un-sourced disbursement could reach the real bank.
--       A two-tier chain where both tiers are identical offers the appearance of a second chance and
--       none of the substance. The only role holding 1000 was cash_dip (a DIP-cash role).
--
-- WHY IT MATTERS BEYOND THE -350: in reality $250 left Bank of America. In the books BoA never moved,
-- so the books claim $250 more at BoA than the bank holds and the bank reconciliation cannot tie. A
-- negative "Undeposited Funds" is also unanswerable on a balance sheet — it asserts a negative pile of
-- customer cheques waiting to be deposited.
--
-- OWNER RULING 2026-08-11 (verbatim): "THE DEFAULT BANK SHOULD BE BANK OF AMERICA. ... YES WE NEED TO
-- PICK THE SOURCE BECAUSE WE MIGHT SIGN CASH ADVANCE FROM BANK OF AMERICA ACCOUNT, OR USE CASH APP, OR
-- CREDIT CARD, OR DIESEL CARD, ETC."
-- So: an explicit operator-chosen source ALWAYS wins (that path already worked and is untouched); this
-- migration only designates the DEFAULT used when none was chosen.
--
-- WHAT THIS MIGRATION DOES: binds the new `operating_bank` CoA role to USMCA 1000
-- "Bank of America - Operating (USMCA)". The code half (a disbursement resolver that reads
-- operating_bank and FAILS CLOSED instead of falling back to a clearing account) ships in the same PR.
--
-- WHY A ROLE AND NOT A HEURISTIC: USMCA has two GL-bridged bank accounts — 1000 Bank of America and
-- 1295 Relay Fuel Wallet (the diesel card). Name-matching between them to guess where real money left
-- is precisely the failure this role exists to end, so `operating_bank` is DELIBERATELY absent from
-- ROLE_FALLBACKS in resolver.service.ts: unbound entities fail closed rather than post to a guess.
--
-- ENTITY SCOPE: USMCA ONLY (5c854333-6ea5-4faa-af31-67cb272fef80), per USMCA-WIRE-LAW and the
-- 2026-08-11 weekend merge law. TRANSP and TRK are NOT bound here and are NOT touched. That is safe
-- rather than a gap: driver_finance.driver_advances (2 rows) and driver_reimbursements (1 row) exist
-- ONLY under USMCA on prod, so no other entity has ever taken these posting paths. When TRANSP/TRK
-- come into scope they bind operating_bank the same way; until then they fail closed, which is the
-- correct behaviour for an undesignated money account.
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING against the PARTIAL unique index
-- uq_coa_roles_company_role_active = (operating_company_id, role) WHERE is_active = true. The WHERE
-- clause below is REQUIRED, not decoration: a bare `ON CONFLICT (operating_company_id, role)` does not
-- match a partial index and Postgres raises "no unique or exclusion constraint matching the ON CONFLICT
-- specification" — the migration would fail on apply. is_active is written explicitly for the same
-- reason: the row must fall INSIDE the index predicate for the conflict target to apply.
-- The account is resolved BY account_number within the entity rather than by a hardcoded uuid.
-- Re-running changes nothing. Additive only — no
-- existing role binding is modified or removed (Rule 07 never-delete-only-add); undeposited_funds and
-- cash_clearing keep their current bindings untouched, because they remain correct for RECEIPTS.
--
-- NO RLS/GRANT CHANGE: accounting.chart_of_accounts_roles already carries operating_company_id with
-- FORCED RLS and the standard grants.
--
-- NO LEDGER CHANGE: this writes one role-binding row. It creates, alters and reverses no posting.
-- The two mis-posted advances are repaired separately through the canonical reverser, never by SQL.

-- STEP 1 — widen the role CHECK. accounting.chart_of_accounts_roles.role is guarded by a whitelist
-- CHECK, so the INSERT below fails with "violates check constraint chart_of_accounts_roles_role_check"
-- until 'operating_bank' is admitted. Caught by dry-running this migration against prod inside a
-- rolled-back transaction BEFORE shipping it — the INSERT alone would have failed on apply.
--
-- The list is reproduced from the LIVE constraint definition on prod, not retyped from the code's
-- COA_ROLE_VALUES, because the two differ: prod also admits 'broker_customer_advance_liability', which
-- the TypeScript union does not carry. Retyping from the code would have SILENTLY DROPPED that value
-- and broken any row using it (Rule 07 never-delete-only-add). Every existing value is preserved and
-- exactly one is added.
DO $$
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NOT NULL THEN
    ALTER TABLE accounting.chart_of_accounts_roles
      DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
    ALTER TABLE accounting.chart_of_accounts_roles
      ADD CONSTRAINT chart_of_accounts_roles_role_check
      CHECK (role IN (
        'ar_control','ap_control','cash_clearing','undeposited_funds',
        'revenue_default','expense_default','factor_reserve_default','escrow_liability_default',
        'sales_tax_payable','cash_basis_adjustment_equity','retained_earnings','uncategorized_expense',
        'rental_income','lease_receivable','interest_income','gain_loss_on_disposal',
        'factoring_advance_liability','ar_assigned_to_factor','factoring_recoursed_ar','default_interest_expense',
        'factor_reserve_held','factor_fee_expense','property_tax_expense','property_tax_payable',
        'driver_pay_expense','driver_payroll_clearing','reimbursement_expense','advance_recovery',
        'damage_recovery','lease_recovery','insurance_recovery','fuel_advance_recovery',
        'other_recovery','abandonment_chargeback_recovery','cash_dip','civil_fines_expense',
        'maintenance_parts_expense','warranty_recovery','fuel_overage_receivable','factor_wire_fee',
        'insurance_expense','unbilled_revenue','fixed_asset_default','accum_depr_default',
        'depr_expense_default','heavy_repair_expense','prepaid_asset_default','amortization_expense_default',
        'broker_customer_advance_liability','rent_expense','related_party_interest_expense','operating_bank'
      ));
  END IF;
END $$;

-- STEP 2 — bind the role for USMCA.
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT
  '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid,
  'operating_bank',
  a.id,
  true
FROM catalogs.accounts a
WHERE a.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
  AND a.account_number = '1000'
  AND a.deactivated_at IS NULL
  AND a.is_postable = true
ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;
