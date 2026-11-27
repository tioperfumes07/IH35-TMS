-- ROUND P1.31 L3a (owner box 2026-11-27 15:52 CT) — scripts/verify-rls-migration-scan.mjs reads literal ALTER TABLE … ENABLE /
-- FORCE ROW LEVEL SECURITY lines. 202617080100 / 202617120100 / 202617130100 enabled and forced RLS (and created both policies)
-- inside a FOREACH … format('%1$s') loop, which the scanner does not read. Production verified 2026-11-27: every table below has
-- relrowsecurity = true, relforcerowsecurity = true, 2 policies, 1 ScentsX-wall trigger. These statements are idempotent no-ops on
-- such a table; they make the scan see what is already true. No policy, grant or data change.
BEGIN;
ALTER TABLE scentsx.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.sales_returns FORCE ROW LEVEL SECURITY;
ALTER TABLE scentsx.sales_return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.sales_return_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE scentsx.purchase_order_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.purchase_order_bill_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE scentsx.purchase_order_vendor_credit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.purchase_order_vendor_credit_lines FORCE ROW LEVEL SECURITY;
COMMIT;
