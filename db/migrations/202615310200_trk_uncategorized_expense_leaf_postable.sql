-- 202615310200_trk_uncategorized_expense_leaf_postable.sql
-- CC-1 · Lead ROUND 339 order 1 follow-up — CORRECTS MY OWN 202615310100.
--
-- 202615310100 deactivated TRK's uncategorized_expense role because its account TRK-6999 "Uncategorized Expenses"
-- was non-postable, and its commit called TRK-6999 a header. It is NOT: it has no child accounts (measured on prod
-- 2026-10-02) — a leaf flagged non-postable, the same error shape as USMCA 5450, which that migration made postable.
-- Deactivating the role left TRK with no uncategorized_expense binding, and the live guard
-- verify-wave-h1-catalog-coa-completeness ("required CoA role unbound (only inactive binding)") correctly refused
-- every push. The fix mirrors 5450: make the leaf postable, reactivate exactly one of the two (identical) TRK rows.
-- TRANSP related_party_interest_expense stays deactivated: 6810 really is a header (2 children).
-- (Migration number claimed for ROUND 339 order 2; repurposed for this correction. Order 2 takes a new claim.)
-- Additive, idempotent.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('app.bypass_rls', 'lucia', true);

UPDATE catalogs.accounts a SET is_postable = true
  FROM org.companies c
 WHERE c.id = a.operating_company_id AND c.code = 'TRK' AND a.account_number = 'TRK-6999'
   AND a.is_postable IS NOT TRUE AND a.deactivated_at IS NULL
   AND NOT EXISTS (SELECT 1 FROM catalogs.accounts ch WHERE ch.parent_account_id = a.id);

UPDATE accounting.chart_of_accounts_roles r
   SET is_active = true, updated_at = now()
 WHERE r.id = (
   SELECT r2.id FROM accounting.chart_of_accounts_roles r2
     JOIN org.companies c ON c.id = r2.operating_company_id
     JOIN catalogs.accounts a ON a.id = r2.account_id
    WHERE c.code = 'TRK' AND r2.role = 'uncategorized_expense' AND a.account_number = 'TRK-6999'
    ORDER BY r2.updated_at DESC NULLS LAST, r2.id
    LIMIT 1)
   AND NOT EXISTS (
     SELECT 1 FROM accounting.chart_of_accounts_roles r3
      WHERE r3.operating_company_id = r.operating_company_id AND r3.role = 'uncategorized_expense' AND r3.is_active);

DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM accounting.chart_of_accounts_roles r JOIN org.companies c ON c.id = r.operating_company_id
   WHERE c.code = 'TRK' AND r.role = 'uncategorized_expense' AND r.is_active AND NOT catalogs.account_is_dead(r.account_id);
  -- Fresh / CI databases have no TRK company rows: nothing to bind there.
  IF EXISTS (SELECT 1 FROM org.companies WHERE code = 'TRK')
     AND EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles r JOIN org.companies c ON c.id = r.operating_company_id WHERE c.code = 'TRK' AND r.role = 'uncategorized_expense')
     AND n <> 1 THEN
    RAISE EXCEPTION '202615310200: TRK uncategorized_expense must have exactly one live active binding, found %', n;
  END IF;
END $$;
COMMIT;
