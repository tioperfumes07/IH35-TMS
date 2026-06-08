-- ACCT-COA-CANONICALIZATION (1/2) — additive backfill of catalogs.accounts.qbo_account_id.
--
-- Canonical posting chart of accounts = catalogs.accounts (370 rows, GLOBAL, all COA FKs
-- point here). accounting.qbo_accounts is a QBO mirror; its TRANSP slice (365 rows) is the
-- authoritative QBO-side counterpart for this realm.
--
-- This migration links EXISTING catalogs.accounts rows to their QBO account id by matching
-- normalized account names within the TRANSP slice, validated by mapped account type.
-- It is ADDITIVE ONLY:
--   * UPDATEs qbo_account_id only where it is currently NULL.
--   * Never INSERTs, never DELETEs, never changes account_type/account_subtype.
--   * Only links confirmed, bijective name matches (unique name on both sides + type-class agree).
--   * Unmatched accounts (TMS-only / ambiguous / conflict) are left NULL and untouched here;
--     see docs/audits/COA-QBO-RECONCILIATION.json for the full bucket breakdown.
--
-- Live reconciliation at authoring time (TRANSP realm): 347 matched, 0 conflict,
-- 18 ambiguous (non-unique names), 5 TMS-only, 0 QBO-only.
BEGIN;

WITH tms AS (
  SELECT
    id,
    account_type,
    lower(btrim(regexp_replace(account_name, '\s+', ' ', 'g'))) AS nkey
  FROM catalogs.accounts
),
qbo AS (
  SELECT
    qa.qbo_id,
    qa.account_type AS qbo_type,
    lower(btrim(regexp_replace(qa.name, '\s+', ' ', 'g'))) AS nkey
  FROM accounting.qbo_accounts qa
  JOIN org.companies c ON c.id = qa.operating_company_id
  WHERE c.code = 'TRANSP'
    AND qa.qbo_id IS NOT NULL
),
-- bijective guard: only names that are unique on BOTH sides
tms_unique AS (
  SELECT nkey FROM tms GROUP BY nkey HAVING count(*) = 1
),
qbo_unique AS (
  SELECT nkey FROM qbo GROUP BY nkey HAVING count(*) = 1
),
matched AS (
  SELECT t.id AS tms_id, q.qbo_id
  FROM tms t
  JOIN qbo q ON q.nkey = t.nkey
  JOIN tms_unique tu ON tu.nkey = t.nkey
  JOIN qbo_unique qu ON qu.nkey = q.nkey
  WHERE t.account_type = CASE q.qbo_type
      WHEN 'Bank' THEN 'Asset'
      WHEN 'Accounts Receivable' THEN 'Asset'
      WHEN 'Other Current Asset' THEN 'Asset'
      WHEN 'Fixed Asset' THEN 'Asset'
      WHEN 'Other Asset' THEN 'Asset'
      WHEN 'Accounts Payable' THEN 'Liability'
      WHEN 'Credit Card' THEN 'Liability'
      WHEN 'Other Current Liability' THEN 'Liability'
      WHEN 'Long Term Liability' THEN 'Liability'
      WHEN 'Equity' THEN 'Equity'
      WHEN 'Income' THEN 'Income'
      WHEN 'Expense' THEN 'Expense'
      WHEN 'Cost of Goods Sold' THEN 'CostOfGoodsSold'
      WHEN 'Other Income' THEN 'OtherIncome'
      WHEN 'Other Expense' THEN 'OtherExpense'
      ELSE NULL
    END
)
UPDATE catalogs.accounts ca
SET
  qbo_account_id = m.qbo_id,
  qbo_sync_status = 'synced',
  qbo_synced_at = now(),
  qbo_sync_error = NULL,
  updated_at = now()
FROM matched m
WHERE ca.id = m.tms_id
  AND ca.qbo_account_id IS NULL
  -- defensive: never collide with the qbo_account_id UNIQUE constraint
  AND NOT EXISTS (
    SELECT 1 FROM catalogs.accounts x WHERE x.qbo_account_id = m.qbo_id
  );

-- Flag confirmed TMS-only accounts (no QBO counterpart in the TRANSP slice) as local_only,
-- so they are explicit rather than indistinguishable from un-run drift. Additive metadata only.
WITH qbo_names AS (
  SELECT DISTINCT lower(btrim(regexp_replace(qa.name, '\s+', ' ', 'g'))) AS nkey
  FROM accounting.qbo_accounts qa
  JOIN org.companies c ON c.id = qa.operating_company_id
  WHERE c.code = 'TRANSP'
)
UPDATE catalogs.accounts ca
SET
  qbo_sync_status = 'local_only',
  updated_at = now()
WHERE ca.qbo_account_id IS NULL
  AND ca.qbo_sync_status IS NULL
  AND lower(btrim(regexp_replace(ca.account_name, '\s+', ' ', 'g'))) NOT IN (
    SELECT nkey FROM qbo_names
  );

COMMIT;
