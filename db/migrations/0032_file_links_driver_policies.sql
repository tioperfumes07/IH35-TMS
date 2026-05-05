BEGIN;

DROP POLICY IF EXISTS drivers_select_own_file_links ON docs.file_links;
CREATE POLICY drivers_select_own_file_links ON docs.file_links
  FOR SELECT TO ih35_app
  USING (
    entity_type = 'driver'
    AND EXISTS (
      SELECT 1 FROM mdata.drivers d
      WHERE d.id = docs.file_links.entity_id
        AND d.identity_user_id = identity.current_user_id()
    )
  );

DROP POLICY IF EXISTS drivers_insert_own_file_links ON docs.file_links;
CREATE POLICY drivers_insert_own_file_links ON docs.file_links
  FOR INSERT TO ih35_app
  WITH CHECK (
    entity_type = 'driver'
    AND EXISTS (
      SELECT 1 FROM mdata.drivers d
      WHERE d.id = docs.file_links.entity_id
        AND d.identity_user_id = identity.current_user_id()
    )
  );

COMMIT;
