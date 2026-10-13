-- 443.101 R6 (CC-3) — verify-entity-isolation: catalogs.downtime_categories and catalogs.downtime_fault_parties are
-- company-owned (operating_company_id NOT NULL; FK to org.companies added by 202615740913) with RLS ENABLED and a
-- company-scoped SELECT policy, but FORCE was never set — on prod (measured read-only 2026-10-12: relrowsecurity=true,
-- relforcerowsecurity=false, 11 rows each, 0 NULL / 0 orphan opco) and in 202615720912, which restated prod's DDL.
-- Without FORCE the table OWNER role bypasses the policy, so an owner-role read is not entity-walled. Every other
-- company-owned catalog is FORCEd (202606281050 pattern). No app code writes these tables (read-only catalogs:
-- idle-events review + company settlement report), and the existing policy already admits the lucia bypass and the
-- company GUC, so readers are unaffected. Idempotent: FORCE on an already-forced table is a no-op.
ALTER TABLE catalogs.downtime_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE catalogs.downtime_fault_parties FORCE ROW LEVEL SECURITY;
