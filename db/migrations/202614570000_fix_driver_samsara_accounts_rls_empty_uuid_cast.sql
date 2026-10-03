-- 202614570000_fix_driver_samsara_accounts_rls_empty_uuid_cast.sql
-- ============================================================================================================
-- RECONSTRUCTED FROM PRODUCTION 2026-10-03 (CC-1, ROUND 372.2 — docs/bus/10-03-2026-CC-1-ROUND-372-FOUR-RULINGS-AND-THE-MULTI-LOAD-SETTLEMENT-LINE.md)
--   Ledger row: 2026-09-29 17:38:34.042917+00, applied_by claude-cc3-round234, duration 0 ms
--   (_system._schema_migrations). A 0 ms duration means the ledger row was most likely STAMPED rather than the file
--   executed through db-migrate — recorded here as found, not explained away.
--   The original source of this migration was NEVER COMMITTED and could not be found in any checkout, branch or
--   temp directory on this machine (sha256-checked against the ledger checksum).
--   This file is written from production's live catalog (pg_policies, direct endpoint, 2026-10-03) and produces
--   exactly that live state; on production it is never re-run (override recorded, citing the ruling above).
--   Object covered: RLS policy mdata.driver_samsara_accounts.driver_samsara_accounts_entity_scope — the empty-string
--   GUC is NULLIF-guarded before the ::uuid cast. 202615230200_rls_uuid_cast_nullif_driver_samsara_accounts.sql later
--   (re)states the same policy; on a fresh database both produce the live definition below.
--   Intent was reconstructed from effects. It is listed under "what we cannot prove" in the blueprint (ROUND 366.4).
-- ============================================================================================================
BEGIN;
DROP POLICY IF EXISTS driver_samsara_accounts_entity_scope ON mdata.driver_samsara_accounts;
CREATE POLICY driver_samsara_accounts_entity_scope ON mdata.driver_samsara_accounts
  AS PERMISSIVE FOR ALL TO public
  USING ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)))
  WITH CHECK ((identity.is_lucia_bypass() OR (operating_company_id = (NULLIF(current_setting('app.operating_company_id'::text, true), ''::text))::uuid)));
COMMIT;
