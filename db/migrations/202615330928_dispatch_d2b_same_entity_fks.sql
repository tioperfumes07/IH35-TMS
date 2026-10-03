-- 202615330928 · CC-3 · Dispatch D2b (the block, dispatch tables, second half) — every company-bearing foreign key on
-- intransit_issues, late_arrival_aggregates, load_abandonments, load_assignment_history, load_cancellations, load_eta_predictions, load_id_reservations, manual_delivery_authorizations, notify_log, ocr_intake_queue, pod_documents, ratecon_extractions, stop_arrivals, stop_extra_rates, trailer_interchanges
-- gets a composite (operating_company_id, x) -> parent (operating_company_id, key) twin repeating its ON DELETE (SET NULL on
-- the referencing column only). Measured on prod under SET LOCAL app.bypass_rls = 'lucia' (2026-10-03): 0 cross-company
-- rows and 0 company-less parents on all 35; each added NOT VALID, then VALIDATED. load_eta_predictions gained its
-- company column in 202615330927. intransit_issues.operating_company_id was nullable with 0 NULL rows: CHECK validated +
-- SET NOT NULL, so MATCH SIMPLE cannot be bypassed with a NULL company.
-- Idempotent. History is not modified.

SELECT set_config('app.bypass_rls', 'lucia', true);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.intransit_issues'::regclass AND conname = 'intransit_issues_company_required') THEN
    ALTER TABLE dispatch.intransit_issues ADD CONSTRAINT intransit_issues_company_required CHECK (operating_company_id IS NOT NULL) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.intransit_issues VALIDATE CONSTRAINT intransit_issues_company_required;
ALTER TABLE dispatch.intransit_issues ALTER COLUMN operating_company_id SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.intransit_issues'::regclass AND conname = 'intransit_issues_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.intransit_issues ADD CONSTRAINT intransit_issues_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE SET NULL (load_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.intransit_issues VALIDATE CONSTRAINT intransit_issues_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.intransit_issues'::regclass AND conname = 'intransit_issues_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.intransit_issues ADD CONSTRAINT intransit_issues_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_id) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE SET NULL (stop_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.intransit_issues VALIDATE CONSTRAINT intransit_issues_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.intransit_issues'::regclass AND conname = 'intransit_issues_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.intransit_issues ADD CONSTRAINT intransit_issues_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) ON DELETE SET NULL (driver_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.intransit_issues VALIDATE CONSTRAINT intransit_issues_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.late_arrival_aggregates'::regclass AND conname = 'late_arrival_aggregates_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.late_arrival_aggregates ADD CONSTRAINT late_arrival_aggregates_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.late_arrival_aggregates VALIDATE CONSTRAINT late_arrival_aggregates_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_abandonments'::regclass AND conname = 'load_abandonments_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_abandonments ADD CONSTRAINT load_abandonments_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_abandonments VALIDATE CONSTRAINT load_abandonments_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_abandonments'::regclass AND conname = 'load_abandonments_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_abandonments ADD CONSTRAINT load_abandonments_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_abandonments VALIDATE CONSTRAINT load_abandonments_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_abandonments'::regclass AND conname = 'load_abandonments_recovery_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_abandonments ADD CONSTRAINT load_abandonments_recovery_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, recovery_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_abandonments VALIDATE CONSTRAINT load_abandonments_recovery_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_assignment_history'::regclass AND conname = 'load_assignment_history_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_assignment_history ADD CONSTRAINT load_assignment_history_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_assignment_history VALIDATE CONSTRAINT load_assignment_history_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_assignment_history'::regclass AND conname = 'load_assignment_history_previous_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_assignment_history ADD CONSTRAINT load_assignment_history_previous_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, previous_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_assignment_history VALIDATE CONSTRAINT load_assignment_history_previous_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_assignment_history'::regclass AND conname = 'load_assignment_history_new_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_assignment_history ADD CONSTRAINT load_assignment_history_new_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, new_driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_assignment_history VALIDATE CONSTRAINT load_assignment_history_new_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_cancellations'::regclass AND conname = 'load_cancellations_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_cancellations ADD CONSTRAINT load_cancellations_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_cancellations VALIDATE CONSTRAINT load_cancellations_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_cancellations'::regclass AND conname = 'load_cancellations_charge_invoice_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_cancellations ADD CONSTRAINT load_cancellations_charge_invoice_same_entity_fkey
      FOREIGN KEY (operating_company_id, charge_invoice_id) REFERENCES accounting.invoices (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_cancellations VALIDATE CONSTRAINT load_cancellations_charge_invoice_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_cancellations'::regclass AND conname = 'load_cancellations_charge_invoice_line_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_cancellations ADD CONSTRAINT load_cancellations_charge_invoice_line_same_entity_fkey
      FOREIGN KEY (operating_company_id, charge_invoice_line_id) REFERENCES accounting.invoice_lines (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_cancellations VALIDATE CONSTRAINT load_cancellations_charge_invoice_line_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_eta_predictions'::regclass AND conname = 'load_eta_predictions_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_eta_predictions ADD CONSTRAINT load_eta_predictions_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_eta_predictions VALIDATE CONSTRAINT load_eta_predictions_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_eta_predictions'::regclass AND conname = 'load_eta_predictions_predicted_arrival_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_eta_predictions ADD CONSTRAINT load_eta_predictions_predicted_arrival_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, predicted_arrival_stop_uuid) REFERENCES mdata.load_stops (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_eta_predictions VALIDATE CONSTRAINT load_eta_predictions_predicted_arrival_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.load_id_reservations'::regclass AND conname = 'load_id_reservations_consumed_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.load_id_reservations ADD CONSTRAINT load_id_reservations_consumed_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, consumed_load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE SET NULL (consumed_load_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.load_id_reservations VALIDATE CONSTRAINT load_id_reservations_consumed_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.manual_delivery_authorizations'::regclass AND conname = 'manual_delivery_authorizations_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.manual_delivery_authorizations ADD CONSTRAINT manual_delivery_authorizations_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.manual_delivery_authorizations VALIDATE CONSTRAINT manual_delivery_authorizations_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.manual_delivery_authorizations'::regclass AND conname = 'manual_delivery_authorizations_pod_document_same_entity_fkey') THEN
    ALTER TABLE dispatch.manual_delivery_authorizations ADD CONSTRAINT manual_delivery_authorizations_pod_document_same_entity_fkey
      FOREIGN KEY (operating_company_id, pod_document_id) REFERENCES dispatch.pod_documents (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.manual_delivery_authorizations VALIDATE CONSTRAINT manual_delivery_authorizations_pod_document_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.notify_log'::regclass AND conname = 'notify_log_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.notify_log ADD CONSTRAINT notify_log_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.notify_log VALIDATE CONSTRAINT notify_log_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.notify_log'::regclass AND conname = 'notify_log_customer_same_entity_fkey') THEN
    ALTER TABLE dispatch.notify_log ADD CONSTRAINT notify_log_customer_same_entity_fkey
      FOREIGN KEY (operating_company_id, customer_id) REFERENCES mdata.customers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.notify_log VALIDATE CONSTRAINT notify_log_customer_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.notify_log'::regclass AND conname = 'notify_log_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.notify_log ADD CONSTRAINT notify_log_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_id) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE SET NULL (stop_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.notify_log VALIDATE CONSTRAINT notify_log_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.ocr_intake_queue'::regclass AND conname = 'ocr_intake_queue_converted_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.ocr_intake_queue ADD CONSTRAINT ocr_intake_queue_converted_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, converted_load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.ocr_intake_queue VALIDATE CONSTRAINT ocr_intake_queue_converted_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.pod_documents'::regclass AND conname = 'pod_documents_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.pod_documents ADD CONSTRAINT pod_documents_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.pod_documents VALIDATE CONSTRAINT pod_documents_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.pod_documents'::regclass AND conname = 'pod_documents_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.pod_documents ADD CONSTRAINT pod_documents_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_id) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.pod_documents VALIDATE CONSTRAINT pod_documents_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.pod_documents'::regclass AND conname = 'pod_documents_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.pod_documents ADD CONSTRAINT pod_documents_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.pod_documents VALIDATE CONSTRAINT pod_documents_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.ratecon_extractions'::regclass AND conname = 'ratecon_extractions_file_same_entity_fkey') THEN
    ALTER TABLE dispatch.ratecon_extractions ADD CONSTRAINT ratecon_extractions_file_same_entity_fkey
      FOREIGN KEY (operating_company_id, file_id) REFERENCES docs.files (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.ratecon_extractions VALIDATE CONSTRAINT ratecon_extractions_file_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.stop_arrivals'::regclass AND conname = 'stop_arrivals_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.stop_arrivals ADD CONSTRAINT stop_arrivals_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_id) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.stop_arrivals VALIDATE CONSTRAINT stop_arrivals_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.stop_arrivals'::regclass AND conname = 'stop_arrivals_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.stop_arrivals ADD CONSTRAINT stop_arrivals_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.stop_arrivals VALIDATE CONSTRAINT stop_arrivals_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.stop_extra_rates'::regclass AND conname = 'stop_extra_rates_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.stop_extra_rates ADD CONSTRAINT stop_extra_rates_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_uuid) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.stop_extra_rates VALIDATE CONSTRAINT stop_extra_rates_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.stop_extra_rates'::regclass AND conname = 'stop_extra_rates_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.stop_extra_rates ADD CONSTRAINT stop_extra_rates_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_uuid) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.stop_extra_rates VALIDATE CONSTRAINT stop_extra_rates_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.stop_extra_rates'::regclass AND conname = 'stop_extra_rates_invoice_line_same_entity_fkey') THEN
    ALTER TABLE dispatch.stop_extra_rates ADD CONSTRAINT stop_extra_rates_invoice_line_same_entity_fkey
      FOREIGN KEY (operating_company_id, invoice_line_uuid) REFERENCES accounting.invoice_lines (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.stop_extra_rates VALIDATE CONSTRAINT stop_extra_rates_invoice_line_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.trailer_interchanges'::regclass AND conname = 'trailer_interchanges_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.trailer_interchanges ADD CONSTRAINT trailer_interchanges_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.trailer_interchanges VALIDATE CONSTRAINT trailer_interchanges_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.trailer_interchanges'::regclass AND conname = 'trailer_interchanges_non_owned_trailer_same_entity_fkey') THEN
    ALTER TABLE dispatch.trailer_interchanges ADD CONSTRAINT trailer_interchanges_non_owned_trailer_same_entity_fkey
      FOREIGN KEY (operating_company_id, non_owned_trailer_id) REFERENCES dispatch.non_owned_trailers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.trailer_interchanges VALIDATE CONSTRAINT trailer_interchanges_non_owned_trailer_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.trailer_interchanges'::regclass AND conname = 'trailer_interchanges_agreement_document_same_entity_fkey') THEN
    ALTER TABLE dispatch.trailer_interchanges ADD CONSTRAINT trailer_interchanges_agreement_document_same_entity_fkey
      FOREIGN KEY (operating_company_id, agreement_document_id) REFERENCES docs.files (operating_company_id, id) ON DELETE SET NULL (agreement_document_id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.trailer_interchanges VALIDATE CONSTRAINT trailer_interchanges_agreement_document_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.trailer_interchanges'::regclass AND conname = 'trailer_interchanges_insurance_claim_same_entity_fkey') THEN
    ALTER TABLE dispatch.trailer_interchanges ADD CONSTRAINT trailer_interchanges_insurance_claim_same_entity_fkey
      FOREIGN KEY (operating_company_id, insurance_claim_id) REFERENCES insurance.claim (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.trailer_interchanges VALIDATE CONSTRAINT trailer_interchanges_insurance_claim_same_entity_fkey;
