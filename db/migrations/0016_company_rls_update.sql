BEGIN;

DROP POLICY IF EXISTS customers_select ON mdata.customers;
CREATE POLICY customers_select ON mdata.customers
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    deactivated_at IS NULL
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

DROP POLICY IF EXISTS vendors_select ON mdata.vendors;
CREATE POLICY vendors_select ON mdata.vendors
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    deactivated_at IS NULL
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

DROP POLICY IF EXISTS locations_select ON mdata.locations;
CREATE POLICY locations_select ON mdata.locations
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    deactivated_at IS NULL
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

DROP POLICY IF EXISTS units_select ON mdata.units;
CREATE POLICY units_select ON mdata.units
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    deactivated_at IS NULL
    AND (
      owner_company_id IN (SELECT org.user_accessible_company_ids())
      OR currently_leased_to_company_id IN (SELECT org.user_accessible_company_ids())
    )
  )
);

DROP POLICY IF EXISTS equipment_select ON mdata.equipment;
CREATE POLICY equipment_select ON mdata.equipment
FOR SELECT TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    deactivated_at IS NULL
    AND (
      owner_company_id IN (SELECT org.user_accessible_company_ids())
      OR currently_leased_to_company_id IN (SELECT org.user_accessible_company_ids())
    )
  )
);

DROP POLICY IF EXISTS customers_insert ON mdata.customers;
CREATE POLICY customers_insert ON mdata.customers
FOR INSERT TO ih35_app
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant', 'Dispatcher')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

DROP POLICY IF EXISTS customers_update ON mdata.customers;
CREATE POLICY customers_update ON mdata.customers
FOR UPDATE TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant', 'Dispatcher')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id IN (SELECT org.user_accessible_company_ids())
);

DROP POLICY IF EXISTS vendors_insert ON mdata.vendors;
CREATE POLICY vendors_insert ON mdata.vendors
FOR INSERT TO ih35_app
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

DROP POLICY IF EXISTS vendors_update ON mdata.vendors;
CREATE POLICY vendors_update ON mdata.vendors
FOR UPDATE TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Accountant')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id IN (SELECT org.user_accessible_company_ids())
);

DROP POLICY IF EXISTS locations_insert ON mdata.locations;
CREATE POLICY locations_insert ON mdata.locations
FOR INSERT TO ih35_app
WITH CHECK (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
);

DROP POLICY IF EXISTS locations_update ON mdata.locations;
CREATE POLICY locations_update ON mdata.locations
FOR UPDATE TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR (
    identity.current_user_role() IN ('Owner', 'Administrator', 'Manager', 'Dispatcher')
    AND operating_company_id IN (SELECT org.user_accessible_company_ids())
  )
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id IN (SELECT org.user_accessible_company_ids())
);

COMMIT;
