-- SELF-FOUND FIX (live Chrome re-check, 2026-09-11 22:2xZ): 202614090000's SELECT/INSERT/UPDATE
-- policies on catalogs.load_exception_reasons checked the app.operating_company_id session
-- variable read by current_setting -- but apps/backend/src/catalogs/load-exception-reasons.routes.ts
-- uses withCurrentUser, which only sets app.current_user_id (confirmed live in auth/db.ts), never
-- withCompanyScope/setOperatingCompanyScope, so that session variable is never set for a real
-- authenticated request and the policy always evaluated false. Live proof: the new Lists page
-- rendered 0 rows despite 11 real USMCA rows. Repoints all 3 policies to the SAME proven-working
-- org.user_company_access membership pattern catalogs.load_cancellation_reasons already uses
-- successfully under the identical withCurrentUser code path (confirmed live via pg_policies
-- before writing this fix).
BEGIN;

DROP POLICY IF EXISTS load_exception_reasons_select ON catalogs.load_exception_reasons;
CREATE POLICY load_exception_reasons_select ON catalogs.load_exception_reasons
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS load_exception_reasons_insert ON catalogs.load_exception_reasons;
CREATE POLICY load_exception_reasons_insert ON catalogs.load_exception_reasons
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS load_exception_reasons_update ON catalogs.load_exception_reasons;
CREATE POLICY load_exception_reasons_update ON catalogs.load_exception_reasons
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id
      FROM org.user_company_access
      WHERE user_id = identity.current_user_id()
        AND deactivated_at IS NULL
    )
  );

COMMIT;
