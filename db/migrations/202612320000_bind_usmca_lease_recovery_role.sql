-- ACCT-F163 — USMCA has no `lease_recovery` role, and it is about to become the entity that needs it.
--
-- FOUND BY: auditing what USMCA lacks, prompted by the owner's 2026-08-07 statement that TRANSP
-- CEASES OPERATING WITHIN WEEKS. USMCA is the go-forward operating carrier and, per locked decision
-- §8.5, is TMS-AUTHORITATIVE with NO QuickBooks — so a missing role on USMCA has no QBO fallback and
-- surfaces as a hard runtime throw at posting time, the same shape as
-- "ap_control role is not mapped for this entity".
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-07 (RLS-bypassed):
--     accounting.chart_of_accounts_roles — USMCA 45, TRANSP 43, TRK 43
-- USMCA is NOT under-configured overall; it has MORE bound roles than either sibling. Exactly seven
-- roles exist on a sibling and not on USMCA, and SIX of those are correct absences:
--     accum_depr_default · depr_expense_default · fixed_asset_default · gain_loss_on_disposal ·
--     lease_receivable · rental_income        — all TRK-ONLY.
-- TRK is the ASSET HOLDER (owner, 2026-08-07: "trucking is an asset holder only"), and locked
-- decision §180-185 states depreciation lives ONLY on TRK's books and that an asset / Accum-Depr
-- account scoped to TRANSP or USMCA is itself a DEFECT. Binding those on USMCA would CREATE a defect,
-- so this migration deliberately does not.
--
-- THE ONE REAL GAP IS `lease_recovery`, and it is go-live blocking:
--     TRANSP  lease_recovery -> QBO-228        "Leased Trucks from IH35 TRUCKING"  CostOfGoodsSold
--     TRK     lease_recovery -> QBO-1150040001 "Income-Equipment Lease"            Income
--     USMCA   lease_recovery -> (none)
-- TRANSP carries it because TRANSP LEASES ITS UNITS FROM TRK — `mdata.units` records that lease as
-- `currently_leased_to_company_id`, and TRK "earns rental income by leasing units to the operating
-- carrier". When TRANSP stops operating, USMCA becomes the lessee of those same units. Without this
-- binding the first USMCA lease posting throws instead of posting.
--
-- NO ACCOUNT IS CREATED — the target already exists and only needed binding:
--     USMCA  QBO-228-USMCA  "Leased Trucks from IH35 TRUCKING"  CostOfGoodsSold
-- It is USMCA's own mirror of TRANSP's QBO-228, same name, same account_type, in USMCA's own chart.
-- The owner's standing authorization to CREATE a missing USMCA account was therefore not needed here;
-- binding an existing, identically-named account is strictly lower risk than minting a new one, and
-- is the option this migration takes.
--
-- Idempotent: NOT EXISTS guard on the active binding (uq_coa_roles_company_role_active is UNIQUE on
-- (operating_company_id, role) WHERE is_active), so a re-run is a no-op. Additive only — no existing
-- row is modified, and TRANSP's binding is untouched so the wind-down period keeps posting correctly.

DO $$
DECLARE
  v_opco    uuid;
  v_account uuid;
BEGIN
  IF to_regclass('accounting.chart_of_accounts_roles') IS NULL THEN
    RAISE NOTICE 'ACCT-F163: accounting.chart_of_accounts_roles absent — skipping';
    RETURN;
  END IF;

  SELECT id INTO v_opco FROM org.companies WHERE code = 'USMCA' AND is_active LIMIT 1;
  IF v_opco IS NULL THEN
    RAISE NOTICE 'ACCT-F163: no active USMCA company — skipping (fresh CI database)';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
     WHERE operating_company_id = v_opco AND role = 'lease_recovery' AND is_active
  ) THEN
    RAISE NOTICE 'ACCT-F163: USMCA lease_recovery already bound — no-op';
    RETURN;
  END IF;

  -- Resolve by account_number in USMCA's OWN chart. No hardcoded UUID, and no cross-entity reach:
  -- the predicate is scoped to v_opco, so this can never bind TRANSP's QBO-228 onto USMCA.
  SELECT id INTO v_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_opco
     AND account_number = 'QBO-228-USMCA'
   LIMIT 1;

  IF v_account IS NULL THEN
    RAISE NOTICE
      'ACCT-F163: USMCA account QBO-228-USMCA (Leased Trucks from IH35 TRUCKING) not present — skipping rather than binding a role to nothing';
    RETURN;
  END IF;

  INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
  VALUES (v_opco, 'lease_recovery', v_account, true);

  RAISE NOTICE 'ACCT-F163: USMCA lease_recovery -> QBO-228-USMCA (Leased Trucks from IH35 TRUCKING) bound';
END
$$;
