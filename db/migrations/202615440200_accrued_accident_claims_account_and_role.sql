-- 202615440200_accrued_accident_claims_account_and_role.sql
-- CC-1 · LST-F424 — an accident cost the company absorbs is an ACCRUED CLAIM until its payee invoices.
--
-- safety/accident-liabilities.service.ts posted the owner's "company absorbs" decision as Dr <liability expense> /
-- Cr ap_control, a raw journal line with no payee. Two root defects:
--   1. ROUND 393.1 (trg_ap_control_written_only_by_documents) refuses an ap_control line that is not a bill / bill
--      payment / vendor credit, so the first absorb decision would throw.
--   2. A/P is owed to a VENDOR. At decision time there is no invoice and often no payee yet (repair shop, claimant,
--      towing), so an A/P line made the payable unattributable and the A/P subledger could never tie to GL.
-- The obligation is real at decision time, so the expense is recognised then, against an accrued liability. When the
-- payee invoices, the bill is coded to this account, which clears the accrual against the vendor's A/P (owner
-- 2026-10-06: "I follow your recommendations").
--
--   2180 Accrued Accident Claims   Liability / OtherCurrentLiability   role accrued_claims_liability
-- It sits beside 2170 Driver Net-Pay Clearing and 2175 Driver Reimbursements Payable. USMCA only (TRANSP and TRK are
-- frozen). The company is resolved by CODE, never a UUID. Idempotent. Writes one account and one role binding.
-- Step 0 admits the role to chart_of_accounts_roles_role_check first (the dynamic append shape of 202615400930).

DO $$
DECLARE def text; roles text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'chart_of_accounts_roles_role_check' AND c.conrelid = 'accounting.chart_of_accounts_roles'::regclass;
  IF def IS NULL THEN RETURN; END IF;
  IF substring(def from '\{([^}]*)\}') IS NOT NULL THEN
    roles := string_to_array(substring(def from '\{([^}]*)\}'), ',');
  ELSE
    SELECT array_agg(DISTINCT m[1]) INTO roles FROM regexp_matches(def, '''([a-z0-9_]+)''', 'g') AS m;
  END IF;
  IF roles IS NULL OR cardinality(roles) < 10 THEN
    RAISE EXCEPTION '202615440200: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT (roles @> ARRAY['accrued_claims_liability']) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['accrued_claims_liability']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE
  v_company uuid;
  v_account uuid;
BEGIN
  SELECT id INTO v_company FROM org.companies WHERE code = 'USMCA';
  IF v_company IS NULL THEN
    RAISE NOTICE '202615440200: no company with code USMCA — nothing to do.';
    RETURN;
  END IF;

  SELECT id INTO v_account FROM catalogs.accounts WHERE operating_company_id = v_company AND account_number = '2180';
  IF v_account IS NULL THEN
    INSERT INTO catalogs.accounts (
      operating_company_id, account_number, account_name, account_type, account_subtype,
      is_postable, currency_code, posts_to_financials, notes
    )
    VALUES (
      v_company, '2180', 'Accrued Accident Claims', 'Liability', 'OtherCurrentLiability',
      true, 'USD', true,
      'Accident costs the company absorbs, accrued at the owner''s decision; cleared when the payee''s bill is coded '
      || 'here. LST-F424, owner 2026-10-06.'
    )
    RETURNING id INTO v_account;
    RAISE NOTICE '202615440200: created 2180 Accrued Accident Claims.';
  ELSE
    RAISE NOTICE '202615440200: 2180 already exists — left as is.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
     WHERE operating_company_id = v_company AND role = 'accrued_claims_liability' AND is_active
  ) THEN
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    VALUES (v_company, 'accrued_claims_liability', v_account, true);
    RAISE NOTICE '202615440200: bound role accrued_claims_liability -> 2180.';
  END IF;
END $$;
