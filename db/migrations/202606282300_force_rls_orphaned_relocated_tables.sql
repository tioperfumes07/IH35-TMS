-- ============================================================================
-- FORCE RLS on the relocated orphaned tables (CODER-29)
-- Tier-1, BUILD-AND-HOLD — Jorge labels after GUARD Neon-verifies; do NOT self-merge
-- (§1.4: RLS change on financial/ops tables).
-- ----------------------------------------------------------------------------
-- VERIFY-FIRST (fresh-migrated DB, authoritative) — supersedes the stale block-02 spec:
--   * The block-02 premise "4 tables CONFIRMED MISSING -> create them" is WRONG. All four
--     ALREADY EXIST (CC-05 #1584 relocated them into db/migrations/). Present/missing matrix:
--     every one of the 10 orphaned-file target tables resolves via to_regclass on a fresh DB.
--   * Each of these four is RLS-ENABLED with a company-isolation policy + operating_company_id,
--     but relforcerowsecurity = FALSE -> the policy does NOT apply to the table owner, so a
--     superuser/owner-context query can leak across entities. (settlements.settlement_disputes
--     is ALREADY forced — intentionally NOT touched here.)
--   * Each policy was verified opco-scoped + lucia-bypass + role-gated to ih35_app, e.g.:
--       USING (identity.is_lucia_bypass()
--              OR operating_company_id = NULLIF(current_setting('app.operating_company_id',true),'')::uuid)
--     so ENABLE + FORCE will NOT lock the app out (bypass + opco + role cover all access).
--
-- Idempotent: ENABLE/FORCE ROW LEVEL SECURITY are no-ops when already set.
-- Literal ALTERs (not a dynamic DO-loop) so the static rls-migration-scan sees them.
-- ============================================================================

ALTER TABLE driver_finance.auto_deduction_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.auto_deduction_policies FORCE ROW LEVEL SECURITY;

ALTER TABLE settlements.team_split_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlements.team_split_configs FORCE ROW LEVEL SECURITY;

ALTER TABLE maintenance.road_service_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance.road_service_tickets FORCE ROW LEVEL SECURITY;

ALTER TABLE mdata.maintenance_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.maintenance_parts FORCE ROW LEVEL SECURITY;
