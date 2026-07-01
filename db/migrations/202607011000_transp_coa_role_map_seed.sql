-- 202607011000_transp_coa_role_map_seed.sql
-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] BLOCK-00 prerequisite: seed TRANSP's control-account role map.
--
-- WHY (GUARD-verified): accounting.chart_of_accounts_roles is EMPTY for every entity. The posting engines
-- resolve A/P and A/R BY ROLE (apps/backend/src/accounting/coa-roles/resolver.service.ts →
-- resolveControlRoleAccount, CONTROL_ROLES = {ar_control, ap_control}, fail-closed →
-- ControlAccountDesignationError). With no role rows, CHAIN-04 (Bill-Payment→GL) and CHAIN-06 (Invoice→AR)
-- cannot resolve a debit/credit account and cannot post. The earlier "designation" migrations
-- (202606290072 ar / 202606300020 ap) only UPDATE (re-point) an assumed-existing row → they NO-OP on an
-- empty table, so the roles were never actually seeded. This migration seeds them (INSERT, not UPDATE).
--
-- DRIFT FIX (do not use the BLOCK-00 spec's role strings): the spec says role 'accounts_payable' /
-- 'accounts_receivable', but the resolver code + the chart_of_accounts_roles CHECK use 'ap_control' /
-- 'ar_control'. Seeding the spec's names would leave the resolver still unmapped. This migration seeds
-- the CODE's names.
--
-- ACCOUNT CHOICE (owner-confirmable via the JORGE-APPROVED label): QBO-synced controls, because that is
-- where the live QBO balances sit — A/P $1,321,866.15 is against QBO-47; A/R -$424,632.14 against QBO-45 —
-- and because TRANSP has DUPLICATE A/P (native 2000 vs QBO-47) and A/R (native 1100 vs QBO-45) accounts;
-- designating the QBO-synced ones keeps TMS reconcilable to QuickBooks (system of record). GUARD's BLOCK-00
-- doc recommends the same (Candidate B) "unless your CPA says otherwise." If the CPA prefers native 2000/1100,
-- swap the two account_id literals below before labeling.
--   ap_control -> QBO-47 "Accounts Payable (A/P)"      catalogs.accounts.id = 49ecd817-4f60-408d-8cc1-3f3ad3a5b533 (Liability)
--   ar_control -> QBO-45 "Accounts Receivable (A/R)"   catalogs.accounts.id = 3bfa6640-cfab-4dae-b03d-8989f49ad910 (Asset)
--
-- FRESH-DB SAFE (branch-copy-vs-fresh-DB landmine): the QBO-synced accounts exist on prod but NOT on a fresh
-- CI DB (they arrive via QBO sync). So this is a CONDITIONAL seed (INSERT ... SELECT ... JOIN the account) —
-- on a fresh DB the JOIN yields 0 rows and the migration is a clean no-op; it does NOT RAISE (a RAISE would
-- fail build-typecheck, which runs db:migrate on a virgin DB). The fail-CLOSED behavior lives at runtime in
-- the resolver (409 / ControlAccountDesignationError if a required role is unmapped) — not here.
--
-- Idempotent (partial unique uq_coa_roles_company_role_active on (operating_company_id, role) WHERE is_active
-- → ON CONFLICT ... DO UPDATE). void-not-delete. TRANSP opco resolved by code, never hardcoded. No RLS change.
-- §1.4 financial cluster — NEVER self-merge; owner labels JORGE-APPROVED after confirming the two account IDs.

BEGIN;

-- ap_control -> QBO-47 (only if the account exists for TRANSP as a Liability; else no-op on fresh DB)
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_at, updated_at)
SELECT c.id, 'ap_control', a.id, true, now(), now()
FROM org.companies c
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.id = '49ecd817-4f60-408d-8cc1-3f3ad3a5b533'::uuid
 AND a.account_type = 'Liability'
WHERE c.code = 'TRANSP'
ON CONFLICT (operating_company_id, role) WHERE is_active
DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();

-- ar_control -> QBO-45 (only if the account exists for TRANSP as an Asset; else no-op on fresh DB)
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_at, updated_at)
SELECT c.id, 'ar_control', a.id, true, now(), now()
FROM org.companies c
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.id = '3bfa6640-cfab-4dae-b03d-8989f49ad910'::uuid
 AND a.account_type = 'Asset'
WHERE c.code = 'TRANSP'
ON CONFLICT (operating_company_id, role) WHERE is_active
DO UPDATE SET account_id = EXCLUDED.account_id, updated_at = now();

COMMIT;

-- POST-DEPLOY VERIFICATION (run on prod after apply — expect exactly these two rows for TRANSP):
--   SET app.operating_company_id = '<TRANSP>';
--   SELECT role, account_id FROM accounting.chart_of_accounts_roles
--    WHERE operating_company_id = (SELECT id FROM org.companies WHERE code='TRANSP') AND is_active
--    ORDER BY role;   -- ap_control -> 49ecd817… , ar_control -> 3bfa6640…
--   -- sales_tax_payable: intentionally NOT seeded (freight not sales-taxed — confirm N/A).
