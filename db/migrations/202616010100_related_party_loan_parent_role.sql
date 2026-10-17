-- 202616010100_related_party_loan_parent_role.sql
-- LEAD 443.189 (owner 2026-10-16 20:26 CT "No more pending work"; CC-2 443.187 finding).
-- party-account.service.ts hard-codes the related-party parent as account NUMBER '2410'. Every other poster resolves its
-- accounts by CoA role (202615370930 every_poster_resolves_by_role_bindings); a number can be renumbered by the owner in
-- the chart of accounts, a role binding cannot drift silently.
--   role related_party_loan_parent → 2410 Owner / Related-Party Loan Payable (Liability)
-- USMCA only (TRANSP and TRK are frozen). The company is resolved by CODE, never a UUID. Idempotent. Step 0 admits the
-- role to chart_of_accounts_roles_role_check with the dynamic append shape of 202615440200. No account is created: the
-- binding is written only when exactly one active 2410 exists; otherwise a NOTICE and nothing is written.

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
    RAISE EXCEPTION '202616010100: could not read chart_of_accounts_roles_role_check (% roles) — refusing to re-create it', cardinality(roles);
  END IF;
  IF NOT (roles @> ARRAY['related_party_loan_parent']) THEN
    roles := array(SELECT DISTINCT unnest(roles || ARRAY['related_party_loan_parent']));
    ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT chart_of_accounts_roles_role_check;
    EXECUTE format('ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check CHECK (role = ANY (%L::text[]))', roles);
  END IF;
END $$;

DO $$
DECLARE
  v_company uuid;
  v_account uuid;
  v_count int;
BEGIN
  SELECT id INTO v_company FROM org.companies WHERE code = 'USMCA';
  IF v_company IS NULL THEN
    RAISE NOTICE '202616010100: no company with code USMCA — nothing to do.';
    RETURN;
  END IF;

  SELECT count(*), min(id::text)::uuid INTO v_count, v_account
    FROM catalogs.accounts
   WHERE operating_company_id = v_company AND account_number = '2410' AND deactivated_at IS NULL;
  IF v_count <> 1 THEN
    RAISE NOTICE '202616010100: expected exactly one active 2410 on USMCA, found % — no binding written.', v_count;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles
     WHERE operating_company_id = v_company AND role = 'related_party_loan_parent' AND is_active
  ) THEN
    INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
    VALUES (v_company, 'related_party_loan_parent', v_account, true);
    RAISE NOTICE '202616010100: bound role related_party_loan_parent -> 2410.';
  END IF;
END $$;
