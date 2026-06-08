-- GAP-52: Extend safety.integrity_findings for driver↔QBO vendor drift classes.
BEGIN;

ALTER TABLE safety.integrity_findings DROP CONSTRAINT IF EXISTS integrity_findings_anomaly_class_check;
ALTER TABLE safety.integrity_findings ADD CONSTRAINT integrity_findings_anomaly_class_check
  CHECK (anomaly_class IN (
    'orphan_entry','orphan_exit','duplicate_fire','expected_missing',
    'qbo_vendor_name_drift','samsara_id_drift','manual_override_drift','qbo_vendor_missing'
  ));

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON safety.integrity_findings TO ih35_app;

COMMIT;
