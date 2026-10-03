-- 202615330923 · CC-3 · Dispatch D2a (the block, dispatch tables, first half) — every company-bearing foreign key on
-- auto_status_suggestion_responses, auto_status_suggestions, bol_documents, border_crossing_events, cargo_sensor_incidents, cargo_sensor_readings, customer_notify_preferences, detention_events, detention_evidence, detention_requests, driver_layovers, equipment_transfer_requests
-- gets a composite (operating_company_id, x) -> parent (operating_company_id, key) twin repeating its ON DELETE (SET NULL on
-- the referencing column only, so a row never loses its company). Measured on prod under SET LOCAL app.bypass_rls =
-- 'lucia' (2026-10-03): 0 cross-company rows and 0 company-less parents on all 35 — each is added NOT VALID, then
-- VALIDATED. The second half (D2b) follows in 202615330928; never 71 in one PR (owner, ROUND 345).
-- Idempotent. History is not modified.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.auto_status_suggestion_responses'::regclass AND conname = 'auto_status_suggestion_responses_suggestion_same_entity_fkey') THEN
    ALTER TABLE dispatch.auto_status_suggestion_responses ADD CONSTRAINT auto_status_suggestion_responses_suggestion_same_entity_fkey
      FOREIGN KEY (operating_company_id, suggestion_id) REFERENCES dispatch.auto_status_suggestions (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.auto_status_suggestion_responses VALIDATE CONSTRAINT auto_status_suggestion_responses_suggestion_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.auto_status_suggestions'::regclass AND conname = 'auto_status_suggestions_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.auto_status_suggestions ADD CONSTRAINT auto_status_suggestions_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.auto_status_suggestions VALIDATE CONSTRAINT auto_status_suggestions_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.auto_status_suggestions'::regclass AND conname = 'auto_status_suggestions_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.auto_status_suggestions ADD CONSTRAINT auto_status_suggestions_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.auto_status_suggestions VALIDATE CONSTRAINT auto_status_suggestions_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.bol_documents'::regclass AND conname = 'bol_documents_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.bol_documents ADD CONSTRAINT bol_documents_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.bol_documents VALIDATE CONSTRAINT bol_documents_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.border_crossing_events'::regclass AND conname = 'border_crossing_events_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.border_crossing_events ADD CONSTRAINT border_crossing_events_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_uuid) REFERENCES mdata.drivers (operating_company_id, id) ON DELETE SET NULL (driver_uuid) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.border_crossing_events VALIDATE CONSTRAINT border_crossing_events_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.border_crossing_events'::regclass AND conname = 'border_crossing_events_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.border_crossing_events ADD CONSTRAINT border_crossing_events_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_uuid) REFERENCES mdata.loads (operating_company_id, id) ON DELETE SET NULL (load_uuid) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.border_crossing_events VALIDATE CONSTRAINT border_crossing_events_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.border_crossing_events'::regclass AND conname = 'border_crossing_events_unit_border_crossing_same_entity_fkey') THEN
    ALTER TABLE dispatch.border_crossing_events ADD CONSTRAINT border_crossing_events_unit_border_crossing_same_entity_fkey
      FOREIGN KEY (operating_company_id, unit_border_crossing_id) REFERENCES mdata.unit_border_crossings (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.border_crossing_events VALIDATE CONSTRAINT border_crossing_events_unit_border_crossing_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.cargo_sensor_incidents'::regclass AND conname = 'cargo_sensor_incidents_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.cargo_sensor_incidents ADD CONSTRAINT cargo_sensor_incidents_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.cargo_sensor_incidents VALIDATE CONSTRAINT cargo_sensor_incidents_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.cargo_sensor_incidents'::regclass AND conname = 'cargo_sensor_incidents_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.cargo_sensor_incidents ADD CONSTRAINT cargo_sensor_incidents_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.cargo_sensor_incidents VALIDATE CONSTRAINT cargo_sensor_incidents_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.cargo_sensor_incidents'::regclass AND conname = 'cargo_sensor_incidents_customer_same_entity_fkey') THEN
    ALTER TABLE dispatch.cargo_sensor_incidents ADD CONSTRAINT cargo_sensor_incidents_customer_same_entity_fkey
      FOREIGN KEY (operating_company_id, customer_id) REFERENCES mdata.customers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.cargo_sensor_incidents VALIDATE CONSTRAINT cargo_sensor_incidents_customer_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.cargo_sensor_incidents'::regclass AND conname = 'cargo_sensor_incidents_first_reading_same_entity_fkey') THEN
    ALTER TABLE dispatch.cargo_sensor_incidents ADD CONSTRAINT cargo_sensor_incidents_first_reading_same_entity_fkey
      FOREIGN KEY (operating_company_id, first_reading_uuid) REFERENCES dispatch.cargo_sensor_readings (operating_company_id, uuid) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.cargo_sensor_incidents VALIDATE CONSTRAINT cargo_sensor_incidents_first_reading_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.cargo_sensor_incidents'::regclass AND conname = 'cargo_sensor_incidents_last_reading_same_entity_fkey') THEN
    ALTER TABLE dispatch.cargo_sensor_incidents ADD CONSTRAINT cargo_sensor_incidents_last_reading_same_entity_fkey
      FOREIGN KEY (operating_company_id, last_reading_uuid) REFERENCES dispatch.cargo_sensor_readings (operating_company_id, uuid) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.cargo_sensor_incidents VALIDATE CONSTRAINT cargo_sensor_incidents_last_reading_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.cargo_sensor_incidents'::regclass AND conname = 'cargo_sensor_incidents_claim_incident_same_entity_fkey') THEN
    ALTER TABLE dispatch.cargo_sensor_incidents ADD CONSTRAINT cargo_sensor_incidents_claim_incident_same_entity_fkey
      FOREIGN KEY (operating_company_id, claim_incident_id) REFERENCES safety.incidents (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.cargo_sensor_incidents VALIDATE CONSTRAINT cargo_sensor_incidents_claim_incident_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.cargo_sensor_readings'::regclass AND conname = 'cargo_sensor_readings_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.cargo_sensor_readings ADD CONSTRAINT cargo_sensor_readings_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_uuid) REFERENCES mdata.loads (operating_company_id, id) ON DELETE SET NULL (load_uuid) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.cargo_sensor_readings VALIDATE CONSTRAINT cargo_sensor_readings_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.customer_notify_preferences'::regclass AND conname = 'customer_notify_preferences_customer_same_entity_fkey') THEN
    ALTER TABLE dispatch.customer_notify_preferences ADD CONSTRAINT customer_notify_preferences_customer_same_entity_fkey
      FOREIGN KEY (operating_company_id, customer_id) REFERENCES mdata.customers (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.customer_notify_preferences VALIDATE CONSTRAINT customer_notify_preferences_customer_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_events'::regclass AND conname = 'detention_events_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_events ADD CONSTRAINT detention_events_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_events VALIDATE CONSTRAINT detention_events_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_events'::regclass AND conname = 'detention_events_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_events ADD CONSTRAINT detention_events_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_id) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_events VALIDATE CONSTRAINT detention_events_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_events'::regclass AND conname = 'detention_events_stop_arrival_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_events ADD CONSTRAINT detention_events_stop_arrival_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_arrival_id) REFERENCES dispatch.stop_arrivals (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_events VALIDATE CONSTRAINT detention_events_stop_arrival_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_events'::regclass AND conname = 'detention_events_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_events ADD CONSTRAINT detention_events_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_id) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_events VALIDATE CONSTRAINT detention_events_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_events'::regclass AND conname = 'detention_events_geofence_event_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_events ADD CONSTRAINT detention_events_geofence_event_same_entity_fkey
      FOREIGN KEY (operating_company_id, geofence_event_id) REFERENCES geo.geofence_events (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_events VALIDATE CONSTRAINT detention_events_geofence_event_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_evidence'::regclass AND conname = 'detention_evidence_detention_request_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_evidence ADD CONSTRAINT detention_evidence_detention_request_same_entity_fkey
      FOREIGN KEY (operating_company_id, detention_request_id) REFERENCES dispatch.detention_requests (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_evidence VALIDATE CONSTRAINT detention_evidence_detention_request_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_evidence'::regclass AND conname = 'detention_evidence_detention_event_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_evidence ADD CONSTRAINT detention_evidence_detention_event_same_entity_fkey
      FOREIGN KEY (operating_company_id, detention_event_id) REFERENCES dispatch.detention_events (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_evidence VALIDATE CONSTRAINT detention_evidence_detention_event_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_evidence'::regclass AND conname = 'detention_evidence_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_evidence ADD CONSTRAINT detention_evidence_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_evidence VALIDATE CONSTRAINT detention_evidence_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_evidence'::regclass AND conname = 'detention_evidence_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_evidence ADD CONSTRAINT detention_evidence_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_id) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_evidence VALIDATE CONSTRAINT detention_evidence_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_requests'::regclass AND conname = 'detention_requests_detention_event_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_requests ADD CONSTRAINT detention_requests_detention_event_same_entity_fkey
      FOREIGN KEY (operating_company_id, detention_event_id) REFERENCES dispatch.detention_events (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_requests VALIDATE CONSTRAINT detention_requests_detention_event_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_requests'::regclass AND conname = 'detention_requests_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_requests ADD CONSTRAINT detention_requests_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, load_id) REFERENCES mdata.loads (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_requests VALIDATE CONSTRAINT detention_requests_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_requests'::regclass AND conname = 'detention_requests_stop_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_requests ADD CONSTRAINT detention_requests_stop_same_entity_fkey
      FOREIGN KEY (operating_company_id, stop_id) REFERENCES mdata.load_stops (operating_company_id, id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_requests VALIDATE CONSTRAINT detention_requests_stop_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_requests'::regclass AND conname = 'detention_requests_customer_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_requests ADD CONSTRAINT detention_requests_customer_same_entity_fkey
      FOREIGN KEY (operating_company_id, customer_id) REFERENCES mdata.customers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_requests VALIDATE CONSTRAINT detention_requests_customer_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_requests'::regclass AND conname = 'detention_requests_invoice_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_requests ADD CONSTRAINT detention_requests_invoice_same_entity_fkey
      FOREIGN KEY (operating_company_id, invoice_id) REFERENCES accounting.invoices (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_requests VALIDATE CONSTRAINT detention_requests_invoice_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.detention_requests'::regclass AND conname = 'detention_requests_invoice_line_same_entity_fkey') THEN
    ALTER TABLE dispatch.detention_requests ADD CONSTRAINT detention_requests_invoice_line_same_entity_fkey
      FOREIGN KEY (operating_company_id, invoice_line_id) REFERENCES accounting.invoice_lines (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.detention_requests VALIDATE CONSTRAINT detention_requests_invoice_line_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.driver_layovers'::regclass AND conname = 'driver_layovers_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.driver_layovers ADD CONSTRAINT driver_layovers_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, driver_uuid) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.driver_layovers VALIDATE CONSTRAINT driver_layovers_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.driver_layovers'::regclass AND conname = 'driver_layovers_previous_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.driver_layovers ADD CONSTRAINT driver_layovers_previous_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, previous_load_uuid) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.driver_layovers VALIDATE CONSTRAINT driver_layovers_previous_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.driver_layovers'::regclass AND conname = 'driver_layovers_next_load_same_entity_fkey') THEN
    ALTER TABLE dispatch.driver_layovers ADD CONSTRAINT driver_layovers_next_load_same_entity_fkey
      FOREIGN KEY (operating_company_id, next_load_uuid) REFERENCES mdata.loads (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.driver_layovers VALIDATE CONSTRAINT driver_layovers_next_load_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.equipment_transfer_requests'::regclass AND conname = 'equipment_transfer_requests_from_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.equipment_transfer_requests ADD CONSTRAINT equipment_transfer_requests_from_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, from_driver_uuid) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.equipment_transfer_requests VALIDATE CONSTRAINT equipment_transfer_requests_from_driver_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'dispatch.equipment_transfer_requests'::regclass AND conname = 'equipment_transfer_requests_to_driver_same_entity_fkey') THEN
    ALTER TABLE dispatch.equipment_transfer_requests ADD CONSTRAINT equipment_transfer_requests_to_driver_same_entity_fkey
      FOREIGN KEY (operating_company_id, to_driver_uuid) REFERENCES mdata.drivers (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE dispatch.equipment_transfer_requests VALIDATE CONSTRAINT equipment_transfer_requests_to_driver_same_entity_fkey;
