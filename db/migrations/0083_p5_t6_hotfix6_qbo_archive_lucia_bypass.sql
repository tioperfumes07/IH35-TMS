BEGIN;

DROP POLICY IF EXISTS qbo_import_batches_company_scope ON qbo_archive.import_batches;
CREATE POLICY qbo_import_batches_company_scope
  ON qbo_archive.import_batches
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS qbo_entities_snapshot_company_scope ON qbo_archive.entities_snapshot;
CREATE POLICY qbo_entities_snapshot_company_scope
  ON qbo_archive.entities_snapshot
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS qbo_transactions_snapshot_company_scope ON qbo_archive.transactions_snapshot;
CREATE POLICY qbo_transactions_snapshot_company_scope
  ON qbo_archive.transactions_snapshot
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS qbo_attachments_snapshot_company_scope ON qbo_archive.attachments_snapshot;
CREATE POLICY qbo_attachments_snapshot_company_scope
  ON qbo_archive.attachments_snapshot
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS qbo_forensic_anomalies_company_scope ON qbo_archive.forensic_anomalies;
CREATE POLICY qbo_forensic_anomalies_company_scope
  ON qbo_archive.forensic_anomalies
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

COMMIT;

