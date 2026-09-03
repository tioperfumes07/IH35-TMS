-- 25-TASK #6 (owner instructions 2026-09-02, owner-corrected 2026-09-03) — bind
-- accounting.chart_of_accounts_roles role='fixed_asset_default' for USMCA.
--
-- GAP: fixed_asset_default had NO row for USMCA. Repairs >= $7,000
-- (capitalize-threshold.ts CAPITALIZE_REPAIR_THRESHOLD_CENTS=700000) resolve this role via
-- maintenance-posting/poster.service.ts -> resolveRoleAccount(...,'fixed_asset_default') at
-- WO-close bill time; unbound, that call throws CoaRoleResolutionError and
-- maint/wo-ap-posting.service.ts's mapMaintWoApHttpError turns it into a 409, failing closed
-- (never inventing/guessing an account) -- confirmed live in source before this migration.
--
-- ACCOUNT: owner-locked, NOT invented here. USMCA's chart already carries the account this role
-- has always meant (docs/lockdown/GO-19-OWNER-DECISIONS-CLOSED-2026-09-01.md §4: "Repairs ->
-- capitalize to 'Fixed Asset - Trucks' (depreciate)" -- the $2,500 -> $7,000 threshold move never
-- touched the account name). Confirmed live on Neon prod: account_number 1500, account_name
-- "Trucks & Tractors", account_type Asset, account_subtype Vehicles, is_postable true,
-- deactivated_at NULL. A prior name-only search ("fixed asset"/"vehicle"/"equipment") missed it
-- because the live account name doesn't literally contain those words -- corrected by querying
-- catalogs.accounts by TYPE + NUMBER RANGE (1500-1600) per the owner's own instruction, not by
-- another guess. This migration creates NO new account and renames nothing.
--
-- CANONICAL-CHECK: no new table, no new role value (fixed_asset_default already exists on the
-- CHECK constraint, widened by 202609100050), no duplicated ledger -- one INSERT binding an
-- existing role to an existing account for one entity.

BEGIN;

INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT c.id, 'fixed_asset_default', a.id, true
FROM org.companies c
JOIN catalogs.accounts a
  ON a.operating_company_id = c.id
 AND a.account_number = '1500'
 AND a.account_name = 'Trucks & Tractors'
 AND a.deactivated_at IS NULL
 AND a.is_postable = true
WHERE c.code = 'USMCA'
  AND NOT EXISTS (
    SELECT 1 FROM accounting.chart_of_accounts_roles r
    WHERE r.operating_company_id = c.id AND r.role = 'fixed_asset_default' AND r.is_active
  );

COMMIT;
