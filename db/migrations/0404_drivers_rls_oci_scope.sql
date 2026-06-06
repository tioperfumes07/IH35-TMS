-- H1 (CLOSURE-32): add OCI tenant scoping to the mdata.drivers SELECT policy.
--
-- Finding: docs/audits/CLOSURE-32-FINDINGS-2026-06-05.md (HIGH = H1).
--   Before: drivers_select USING (identity.is_lucia_bypass() OR identity.current_user_role() IS NOT NULL)
--           -> no operating_company_id scoping; any authenticated user could SELECT all drivers
--           cross-carrier (0 rows leak today only because all drivers are TRANSP; latent gap that
--           activates when TRK/USMCA onboard drivers).
--   After:  OCI-scoped SELECT mirroring mdata.customers / mdata.vendors via
--           org.user_accessible_company_ids(), preserving the Driver self-access path
--           (a Driver-role user may read their own driver row via identity_user_id).
--
-- Scope: touches ONLY the mdata.drivers SELECT policy. No data modification.
-- deactivated_at filtering is intentionally NOT added here — H1 is a tenant-isolation fix;
-- preserving existing visibility of deactivated drivers to in-OCI office/admin views.
-- Idempotent: ENABLE/FORCE RLS (already on) + DROP POLICY IF EXISTS + CREATE POLICY.

BEGIN;

ALTER TABLE mdata.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mdata.drivers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS drivers_select ON mdata.drivers;
CREATE POLICY drivers_select
ON mdata.drivers
FOR SELECT
TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id IN (SELECT org.user_accessible_company_ids())
  OR identity_user_id = identity.current_user_id()
);

COMMIT;

-- DOWN (manual rollback): restore the pre-H1 unscoped policy:
-- DROP POLICY IF EXISTS drivers_select ON mdata.drivers;
-- CREATE POLICY drivers_select ON mdata.drivers FOR SELECT
--   USING (identity.is_lucia_bypass() OR identity.current_user_role() IS NOT NULL);
