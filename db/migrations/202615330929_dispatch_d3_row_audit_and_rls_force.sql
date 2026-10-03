-- 202615330929 · CC-3 · Dispatch D3 — standing order: audit on every table, RLS forced on every table. Measured on prod
-- (2026-10-03): 28 of the 30 dispatch.* tables carried no row-audit trigger (only load_assignment_history and
-- load_charge_lines did); dispatch.manual_delivery_authorizations had RLS enabled but not FORCED (the table owner role
-- read past its company policy). Every dispatch table now writes audit.row_changes through the same audit.tg_audit_row()
-- every audited table uses (it skips no-op updates, so a ticking engine adds a row only when a value changes; the row key
-- is id, or uuid where that is the key). No data is changed.
-- Idempotent.

DROP TRIGGER IF EXISTS trg_audit_auto_status_suggestion_responses ON dispatch.auto_status_suggestion_responses;
CREATE TRIGGER trg_audit_auto_status_suggestion_responses AFTER INSERT OR UPDATE OR DELETE ON dispatch.auto_status_suggestion_responses FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_auto_status_suggestions ON dispatch.auto_status_suggestions;
CREATE TRIGGER trg_audit_auto_status_suggestions AFTER INSERT OR UPDATE OR DELETE ON dispatch.auto_status_suggestions FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_bol_documents ON dispatch.bol_documents;
CREATE TRIGGER trg_audit_bol_documents AFTER INSERT OR UPDATE OR DELETE ON dispatch.bol_documents FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_border_crossing_events ON dispatch.border_crossing_events;
CREATE TRIGGER trg_audit_border_crossing_events AFTER INSERT OR UPDATE OR DELETE ON dispatch.border_crossing_events FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_cargo_sensor_incidents ON dispatch.cargo_sensor_incidents;
CREATE TRIGGER trg_audit_cargo_sensor_incidents AFTER INSERT OR UPDATE OR DELETE ON dispatch.cargo_sensor_incidents FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_cargo_sensor_readings ON dispatch.cargo_sensor_readings;
CREATE TRIGGER trg_audit_cargo_sensor_readings AFTER INSERT OR UPDATE OR DELETE ON dispatch.cargo_sensor_readings FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_customer_notify_preferences ON dispatch.customer_notify_preferences;
CREATE TRIGGER trg_audit_customer_notify_preferences AFTER INSERT OR UPDATE OR DELETE ON dispatch.customer_notify_preferences FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_detention_events ON dispatch.detention_events;
CREATE TRIGGER trg_audit_detention_events AFTER INSERT OR UPDATE OR DELETE ON dispatch.detention_events FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_detention_evidence ON dispatch.detention_evidence;
CREATE TRIGGER trg_audit_detention_evidence AFTER INSERT OR UPDATE OR DELETE ON dispatch.detention_evidence FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_detention_requests ON dispatch.detention_requests;
CREATE TRIGGER trg_audit_detention_requests AFTER INSERT OR UPDATE OR DELETE ON dispatch.detention_requests FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_driver_layovers ON dispatch.driver_layovers;
CREATE TRIGGER trg_audit_driver_layovers AFTER INSERT OR UPDATE OR DELETE ON dispatch.driver_layovers FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_equipment_transfer_requests ON dispatch.equipment_transfer_requests;
CREATE TRIGGER trg_audit_equipment_transfer_requests AFTER INSERT OR UPDATE OR DELETE ON dispatch.equipment_transfer_requests FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_intransit_issues ON dispatch.intransit_issues;
CREATE TRIGGER trg_audit_intransit_issues AFTER INSERT OR UPDATE OR DELETE ON dispatch.intransit_issues FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_late_arrival_aggregates ON dispatch.late_arrival_aggregates;
CREATE TRIGGER trg_audit_late_arrival_aggregates AFTER INSERT OR UPDATE OR DELETE ON dispatch.late_arrival_aggregates FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_load_abandonments ON dispatch.load_abandonments;
CREATE TRIGGER trg_audit_load_abandonments AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_abandonments FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_load_cancellations ON dispatch.load_cancellations;
CREATE TRIGGER trg_audit_load_cancellations AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_cancellations FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_load_eta_predictions ON dispatch.load_eta_predictions;
CREATE TRIGGER trg_audit_load_eta_predictions AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_eta_predictions FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_load_id_reservations ON dispatch.load_id_reservations;
CREATE TRIGGER trg_audit_load_id_reservations AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_id_reservations FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_load_templates ON dispatch.load_templates;
CREATE TRIGGER trg_audit_load_templates AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_templates FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_manual_delivery_authorizations ON dispatch.manual_delivery_authorizations;
CREATE TRIGGER trg_audit_manual_delivery_authorizations AFTER INSERT OR UPDATE OR DELETE ON dispatch.manual_delivery_authorizations FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_non_owned_trailers ON dispatch.non_owned_trailers;
CREATE TRIGGER trg_audit_non_owned_trailers AFTER INSERT OR UPDATE OR DELETE ON dispatch.non_owned_trailers FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_notify_log ON dispatch.notify_log;
CREATE TRIGGER trg_audit_notify_log AFTER INSERT OR UPDATE OR DELETE ON dispatch.notify_log FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_ocr_intake_queue ON dispatch.ocr_intake_queue;
CREATE TRIGGER trg_audit_ocr_intake_queue AFTER INSERT OR UPDATE OR DELETE ON dispatch.ocr_intake_queue FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_pod_documents ON dispatch.pod_documents;
CREATE TRIGGER trg_audit_pod_documents AFTER INSERT OR UPDATE OR DELETE ON dispatch.pod_documents FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_ratecon_extractions ON dispatch.ratecon_extractions;
CREATE TRIGGER trg_audit_ratecon_extractions AFTER INSERT OR UPDATE OR DELETE ON dispatch.ratecon_extractions FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_stop_arrivals ON dispatch.stop_arrivals;
CREATE TRIGGER trg_audit_stop_arrivals AFTER INSERT OR UPDATE OR DELETE ON dispatch.stop_arrivals FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_stop_extra_rates ON dispatch.stop_extra_rates;
CREATE TRIGGER trg_audit_stop_extra_rates AFTER INSERT OR UPDATE OR DELETE ON dispatch.stop_extra_rates FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

DROP TRIGGER IF EXISTS trg_audit_trailer_interchanges ON dispatch.trailer_interchanges;
CREATE TRIGGER trg_audit_trailer_interchanges AFTER INSERT OR UPDATE OR DELETE ON dispatch.trailer_interchanges FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();


ALTER TABLE dispatch.manual_delivery_authorizations FORCE ROW LEVEL SECURITY;
