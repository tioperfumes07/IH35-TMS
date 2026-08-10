-- FINDING: DISP-API-RLS
-- mdata.loads SELECT RLS still keyed on org.user_company_access alone while every other
-- office table uses org.user_accessible_company_ids() (Owner → all active companies).
-- Live prod: Owner users with zero uca rows could not see USMCA loads under ih35_app even
-- with app.operating_company_id set — GET /api/v1/dispatch/loads returned loads=[] (403 or 0 rows).

BEGIN;

DROP POLICY IF EXISTS loads_select_office ON mdata.loads;
CREATE POLICY loads_select_office ON mdata.loads
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY[
          'Owner'::identity.role_enum,
          'Administrator'::identity.role_enum,
          'Manager'::identity.role_enum,
          'Dispatcher'::identity.role_enum,
          'Safety'::identity.role_enum,
          'Accountant'::identity.role_enum
        ]
      )
      AND operating_company_id IN (SELECT org.user_accessible_company_ids())
    )
  );

COMMIT;
