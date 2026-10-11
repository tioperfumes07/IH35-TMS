-- 5785 (CC-3 report 2026-10-11): ONE $301.99 advance was recovered as $1,207.96 (4x) at the settlement close, so the close
-- refused the post: "computed net 34071c does not equal the signed document's TOTAL DUE 124668c (delta -90597c)".
--
-- ROOT CAUSE: driver_finance.v_driver_advance_balances (202615380400) builds `sub` with one row per ACTIVE BRIDGE ROW in
-- driver_finance.driver_advance_accounts and joins postings to it on the account alone. Driver 6edcb351's own sub-account
-- 1245-00-023 has two active bridge rows -- the survivor and the merged-away profile 6e908ee1 (merged_into 6edcb351) -- so
-- `own` lists every posting on that account twice, and `disb_net` (which self-joins `own`) counts the disbursement 2 x 2 = 4
-- times: disbursed_cents 120796 for a 30199 line. The close recovers outstanding_cents from this view. Measured on prod:
-- 2 accounts are bridged to two profiles each (1245-00-023, 1245-00-024), both with a merged-away profile.
--
-- FIX (same columns, same options, same grants): `sub` is one row per (company, owning driver, account) -- a merged-away
-- profile's bridge resolves to the driver it was merged into (mdata.drivers.merged_into_driver_id), and DISTINCT drops the
-- duplicate; `own` takes each posting ONCE (account IN sub), so no bridge or role duplication can multiply a line again.
-- No data is written.

CREATE OR REPLACE VIEW driver_finance.v_driver_advance_balances WITH (security_invoker = true) AS
WITH sub AS (
  SELECT DISTINCT d.operating_company_id,
         COALESCE(dr.merged_into_driver_id, d.driver_id) AS driver_id,
         d.coa_account_id AS account_id
  FROM driver_finance.driver_advance_accounts d
  JOIN mdata.drivers dr ON dr.id = d.driver_id
  JOIN catalogs.accounts s ON s.id = d.coa_account_id AND s.operating_company_id = d.operating_company_id
  JOIN accounting.chart_of_accounts_roles r ON r.account_id = s.parent_account_id AND r.operating_company_id = d.operating_company_id
       AND r.role = 'advance_recovery' AND r.is_active
  WHERE d.is_active
),
own AS (
  SELECT p.id, p.account_id, p.debit_or_credit, p.amount_cents, p.source_transaction_type, p.source_transaction_id, p.reversal_of_line_id
  FROM accounting.journal_entry_postings p
  WHERE p.account_id IN (SELECT sub.account_id FROM sub)
),
disb AS (
  SELECT o.source_transaction_id AS advance_id, o.id AS line_id FROM own o
  WHERE o.source_transaction_type = 'driver_advance' AND o.reversal_of_line_id IS NULL
),
disb_net AS (
  SELECT d.advance_id, SUM(CASE o.debit_or_credit WHEN 'debit' THEN o.amount_cents ELSE -o.amount_cents END) AS cents
  FROM disb d JOIN own o ON o.id = d.line_id OR o.reversal_of_line_id = d.line_id
  GROUP BY d.advance_id
),
recovered AS (
  SELECT sub.driver_id, sub.operating_company_id,
         -COALESCE(SUM(CASE o.debit_or_credit WHEN 'debit' THEN o.amount_cents ELSE -o.amount_cents END), 0) AS cents
  FROM sub LEFT JOIN own o ON o.account_id = sub.account_id
       AND o.id NOT IN (SELECT line_id FROM disb)
       AND NOT EXISTS (SELECT 1 FROM disb x WHERE x.line_id = o.reversal_of_line_id)
  GROUP BY sub.driver_id, sub.operating_company_id
),
per AS (
  SELECT a.id AS advance_id, a.operating_company_id, a.driver_id, a.created_at,
         COALESCE(dn.cents, 0)::bigint AS disbursed_cents,
         COALESCE(rc.cents, 0)::bigint AS driver_recovered_cents
  FROM driver_finance.driver_advances a
  LEFT JOIN disb_net dn ON dn.advance_id = a.id::text
  LEFT JOIN recovered rc ON rc.driver_id = a.driver_id AND rc.operating_company_id = a.operating_company_id
)
SELECT advance_id, operating_company_id, driver_id, disbursed_cents,
       (disbursed_cents - outstanding_cents)::bigint AS recovered_cents,
       outstanding_cents
FROM (
  SELECT per.*,
         GREATEST(0, LEAST(disbursed_cents,
           SUM(disbursed_cents) OVER (PARTITION BY operating_company_id, driver_id ORDER BY created_at, advance_id) - driver_recovered_cents
         ))::bigint AS outstanding_cents
  FROM per
) f
;

COMMENT ON VIEW driver_finance.v_driver_advance_balances IS
  'Driver advance disbursed / recovered / outstanding DERIVED from the GL on the driver''s own 1245 sub-account (ROUND 394 ruling 1, CC-1). One row per posting regardless of how many bridge rows name the account (202615500300: a merged-away profile resolves to its survivor). The only source for an advance balance. Guard: verify-driver-advance-posts-to-drivers-own-subaccount (rules 6-8) + verify-advance-balance-one-row-per-posting.';

GRANT SELECT ON driver_finance.v_driver_advance_balances TO ih35_app;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ih35_ci_readonly') THEN
    GRANT SELECT ON driver_finance.v_driver_advance_balances TO ih35_ci_readonly;
  END IF;
END $$;
