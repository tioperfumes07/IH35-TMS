BEGIN;

-- 0216_audit_canonical_name_drift_capture.sql
-- Drift-capture only (no DDL/data mutation).
-- Why: DS-REMEDIATE-11.run failed in Render shell because code queried audit.events,
-- but production canonical table is audit.audit_events (12,077 live rows).
-- Ledger refs: BATCH-8 historical ledger backfill + DS-REMEDIATE-13 canonical-name fix.
-- This migration does NOT modify audit.audit_events table structure or data.
-- Option selected: B2 (no backward-compat view); code is normalized to audit.audit_events.

SELECT to_regclass('audit.audit_events') AS canonical_audit_table;

COMMIT;
