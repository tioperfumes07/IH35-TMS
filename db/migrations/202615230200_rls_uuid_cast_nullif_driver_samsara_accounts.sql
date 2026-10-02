-- 202615230200_rls_uuid_cast_nullif_driver_samsara_accounts.sql
-- LEAD, 2026-10-01: verify-rls-uuid-cast-nullif root fix.
--
-- 202614380000_driver_samsara_accounts_operating_company.sql (and the policy it superseded,
-- 202614350000_driver_samsara_accounts_map.sql) defined driver_samsara_accounts_entity_scope using a
-- bare current_setting('app.operating_company_id', true)::uuid in both USING and WITH CHECK. When the
-- session GUC is simply unset, ::uuid of NULL is fine (evaluates NULL, policy fails closed as intended).
-- But if the GUC is ever set to the empty string '' (a known failure mode elsewhere in this codebase --
-- see the other NULLIF-wrapped policies), ''::uuid raises "invalid input syntax for type uuid" and the
-- query errors instead of failing closed. ALTER POLICY in place; additive, idempotent, no data change.
--
-- The historical migration files are immutable (already applied to prod) and are NOT edited; their
-- disk checksums are registered in scripts/lib/migration-checksum-overrides.json in this same PR with
-- the comment-only ALLOW_BARE_UUID_CAST tag added next to each flagged line, satisfying
-- verify-rls-uuid-cast-nullif.mjs without altering live-applied DDL semantics.

BEGIN;

ALTER POLICY driver_samsara_accounts_entity_scope ON mdata.driver_samsara_accounts
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

COMMIT;
