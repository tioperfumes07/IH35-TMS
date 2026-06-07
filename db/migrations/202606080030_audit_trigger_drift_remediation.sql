-- ============================================================
-- Migration: 202606080030_audit_trigger_drift_remediation
-- Purpose:   Re-attach 10 audit triggers that are defined in
--            source migrations but absent from production Neon.
-- Source migrations confirmed:
--   0158_abandonment_and_wo_time_tracking.sql    (triggers 1, 2)
--   0156_settlement_disputes_and_driver_teams.sql (trigger 3)
--   0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql (triggers 4, 5)
--   0164_scheduled_reports.sql                   (triggers 6, 7)
--   0192_ops_daily_tasks_module.sql              (trigger 8)
--   0261_safety_events.sql                       (triggers 9, 10)
-- All triggers execute: audit.tg_audit_row()
-- Idempotent: DROP TRIGGER IF EXISTS before every CREATE TRIGGER.
-- ============================================================

-- -----------------------------------------------
-- Defensive schema + table grants (idempotent)
-- ih35_app already has table-level access per the
-- original migrations; these are belt-and-suspenders
-- in case a schema-level USAGE grant was missed.
-- -----------------------------------------------
GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON driver_finance.abandonment_chargebacks TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON driver_finance.settlement_disputes      TO ih35_app;

GRANT USAGE ON SCHEMA maintenance TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.wo_time_entries TO ih35_app;

GRANT USAGE ON SCHEMA qbo TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON qbo.sync_runs             TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON qbo.bill_payment_mappings TO ih35_app;

GRANT USAGE ON SCHEMA reporting TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON reporting.scheduled_reports     TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON reporting.scheduled_report_runs TO ih35_app;

GRANT USAGE ON SCHEMA ops TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON ops.daily_tasks TO ih35_app;

GRANT USAGE ON SCHEMA safety TO ih35_app;
GRANT SELECT, INSERT ON safety.safety_events      TO ih35_app;
GRANT SELECT, INSERT ON safety.safety_event_notes TO ih35_app;

-- -----------------------------------------------
-- 1. driver_finance.abandonment_chargebacks
--    Source: 0158_abandonment_and_wo_time_tracking.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_abandonment_chargebacks ON driver_finance.abandonment_chargebacks;
CREATE TRIGGER tg_audit_abandonment_chargebacks
  AFTER INSERT OR UPDATE OR DELETE ON driver_finance.abandonment_chargebacks
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 2. maintenance.wo_time_entries
--    Source: 0158_abandonment_and_wo_time_tracking.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_wo_time_entries ON maintenance.wo_time_entries;
CREATE TRIGGER tg_audit_wo_time_entries
  AFTER INSERT OR UPDATE OR DELETE ON maintenance.wo_time_entries
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 3. driver_finance.settlement_disputes
--    Source: 0156_settlement_disputes_and_driver_teams.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_settlement_disputes ON driver_finance.settlement_disputes;
CREATE TRIGGER tg_audit_settlement_disputes
  AFTER INSERT OR UPDATE OR DELETE ON driver_finance.settlement_disputes
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 4. qbo.sync_runs
--    Source: 0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_sync_runs ON qbo.sync_runs;
CREATE TRIGGER tg_audit_sync_runs
  AFTER INSERT OR UPDATE OR DELETE ON qbo.sync_runs
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 5. qbo.bill_payment_mappings
--    Source: 0162_p6_t11196_qbo_sync_runs_and_bill_payment_mappings.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_bill_payment_mappings ON qbo.bill_payment_mappings;
CREATE TRIGGER tg_audit_bill_payment_mappings
  AFTER INSERT OR UPDATE OR DELETE ON qbo.bill_payment_mappings
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 6. reporting.scheduled_reports
--    Source: 0164_scheduled_reports.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_scheduled_reports ON reporting.scheduled_reports;
CREATE TRIGGER tg_audit_scheduled_reports
  AFTER INSERT OR UPDATE OR DELETE ON reporting.scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 7. reporting.scheduled_report_runs
--    Source: 0164_scheduled_reports.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_scheduled_report_runs ON reporting.scheduled_report_runs;
CREATE TRIGGER tg_audit_scheduled_report_runs
  AFTER INSERT OR UPDATE OR DELETE ON reporting.scheduled_report_runs
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 8. ops.daily_tasks
--    Source: 0192_ops_daily_tasks_module.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_daily_tasks ON ops.daily_tasks;
CREATE TRIGGER tg_audit_daily_tasks
  AFTER INSERT OR UPDATE OR DELETE ON ops.daily_tasks
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 9. safety.safety_events
--    Source: 0261_safety_events.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_safety_events ON safety.safety_events;
CREATE TRIGGER tg_audit_safety_events
  AFTER INSERT OR UPDATE OR DELETE ON safety.safety_events
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

-- -----------------------------------------------
-- 10. safety.safety_event_notes
--     Source: 0261_safety_events.sql
-- -----------------------------------------------
DROP TRIGGER IF EXISTS tg_audit_safety_event_notes ON safety.safety_event_notes;
CREATE TRIGGER tg_audit_safety_event_notes
  AFTER INSERT OR UPDATE OR DELETE ON safety.safety_event_notes
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();
