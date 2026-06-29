-- ============================================================================
-- RLS-ENABLE dispatch.intransit_issues (Tier-1, BUILD-AND-HOLD — Jorge labels after
-- GUARD Neon-verifies; do NOT self-merge — §1.4 RLS change)
-- ----------------------------------------------------------------------------
-- FINDING (GUARD live-verified on prod): dispatch.intransit_issues has
-- operating_company_id + the company-isolation policy `intransit_issues_company_scope`
-- (added by 202606271600_f2b_intransit_issues_company_rls.sql) — but RLS is DISABLED
-- (relrowsecurity = false), so the policy is DORMANT and the table leaks across entities.
--
-- VERIFIED before enabling: the existing policy is opco-scoped and safe to force —
--   USING:      operating_company_id = current_setting('app.operating_company_id') ...
--   WITH CHECK: operating_company_id = current_setting('app.operating_company_id')
--   plus identity.is_lucia_bypass() for system/migration access and a role gate.
-- So ENABLE + FORCE will NOT lock the app out (bypass + opco + role cover all access).
--
-- The 8 financial tables are already forced by #1588 — NOT touched here.
-- Idempotent: ENABLE/FORCE ROW LEVEL SECURITY are no-ops when already set.
-- Literal ALTERs (not a dynamic DO-loop) so the static rls-migration-scan sees them.
-- ============================================================================

ALTER TABLE dispatch.intransit_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.intransit_issues FORCE ROW LEVEL SECURITY;
