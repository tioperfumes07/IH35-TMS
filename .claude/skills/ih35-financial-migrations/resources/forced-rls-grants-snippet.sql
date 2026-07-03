-- FORCED-RLS + grants block, standalone. Paste after a CREATE TABLE. Replace <schema>.<table>.
-- This is the single most-forgotten step: a new table WITHOUT the ih35_app grant 500s at runtime
-- ("permission denied for table/schema"), and WITHOUT FORCE RLS leaks rows across operating companies.

-- If the schema is new, it also needs USAGE (schemas in the 0065 array already have it):
-- GRANT USAGE ON SCHEMA <schema> TO ih35_app;

ALTER TABLE <schema>.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <schema>.<table> FORCE  ROW LEVEL SECURITY;   -- FORCE: filters even the table owner

DROP POLICY IF EXISTS <table>_entity_select ON <schema>.<table>;
DROP POLICY IF EXISTS <table>_entity_write  ON <schema>.<table>;

-- Read: any user scoped to the row's operating company (or a lucia bypass).
CREATE POLICY <table>_entity_select ON <schema>.<table> FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- Write: same scope, and only privileged roles. Drop the role clause if any scoped user may write.
CREATE POLICY <table>_entity_write ON <schema>.<table> FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

-- Grants. Pick ONE:
--   normal table  :  GRANT SELECT, INSERT, UPDATE ON <schema>.<table> TO ih35_app;   -- no DELETE (void-not-delete)
--   audit/evidence:  GRANT SELECT, INSERT        ON <schema>.<table> TO ih35_app;   -- append-only (no UPDATE/DELETE)
GRANT SELECT, INSERT, UPDATE ON <schema>.<table> TO ih35_app;

-- Verify locally:
--   SELECT relforcerowsecurity FROM pg_class WHERE oid = '<schema>.<table>'::regclass;                 -- expect t
--   SELECT has_table_privilege('ih35_app','<schema>.<table>','DELETE');                                 -- expect f
