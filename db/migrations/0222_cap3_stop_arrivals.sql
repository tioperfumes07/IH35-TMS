-- CAP-3 (Phase 5 Telematics): 250-foot arrival detection + driver confirmation prompts.
BEGIN;

CREATE SCHEMA IF NOT EXISTS dispatch;

CREATE TABLE IF NOT EXISTS dispatch.stop_arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  stop_id uuid NOT NULL REFERENCES mdata.load_stops(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  triggered_at timestamptz NOT NULL,
  confirmed_at timestamptz NULL,
  confirmed_by_driver_uuid uuid NULL REFERENCES identity.users(id),
  distance_at_trigger_ft int NOT NULL CHECK (distance_at_trigger_ft >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stop_arrivals_confirmed_after_trigger CHECK (confirmed_at IS NULL OR confirmed_at >= triggered_at),
  CONSTRAINT stop_arrivals_confirmed_by_guard CHECK (
    (confirmed_at IS NULL AND confirmed_by_driver_uuid IS NULL)
    OR (confirmed_at IS NOT NULL AND confirmed_by_driver_uuid IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stop_arrivals_trigger_dedupe
  ON dispatch.stop_arrivals (operating_company_id, stop_id, unit_id, triggered_at);

CREATE INDEX IF NOT EXISTS idx_stop_arrivals_lookup
  ON dispatch.stop_arrivals (operating_company_id, stop_id, unit_id, triggered_at DESC);

CREATE INDEX IF NOT EXISTS idx_stop_arrivals_driver_pending
  ON dispatch.stop_arrivals (operating_company_id, driver_id, triggered_at DESC)
  WHERE confirmed_at IS NULL;

CREATE OR REPLACE FUNCTION dispatch.stop_arrivals_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.operating_company_id <> NEW.operating_company_id
     OR OLD.stop_id <> NEW.stop_id
     OR OLD.unit_id <> NEW.unit_id
     OR OLD.driver_id IS DISTINCT FROM NEW.driver_id
     OR OLD.triggered_at <> NEW.triggered_at
     OR OLD.distance_at_trigger_ft <> NEW.distance_at_trigger_ft
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'dispatch.stop_arrivals immutable columns cannot be updated';
  END IF;

  IF OLD.confirmed_at IS NOT NULL THEN
    RAISE EXCEPTION 'dispatch.stop_arrivals confirmation cannot be modified once set';
  END IF;

  IF NEW.confirmed_at IS NULL OR NEW.confirmed_by_driver_uuid IS NULL THEN
    RAISE EXCEPTION 'dispatch.stop_arrivals confirmation update must set both confirmed_at and confirmed_by_driver_uuid';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stop_arrivals_update_guard ON dispatch.stop_arrivals;
CREATE TRIGGER trg_stop_arrivals_update_guard
BEFORE UPDATE ON dispatch.stop_arrivals
FOR EACH ROW
EXECUTE FUNCTION dispatch.stop_arrivals_update_guard();

CREATE OR REPLACE FUNCTION dispatch.stop_arrivals_delete_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'dispatch.stop_arrivals is append-only — DELETE is not allowed';
END;
$$;

DROP TRIGGER IF EXISTS trg_stop_arrivals_delete_block ON dispatch.stop_arrivals;
CREATE TRIGGER trg_stop_arrivals_delete_block
BEFORE DELETE ON dispatch.stop_arrivals
FOR EACH ROW
EXECUTE FUNCTION dispatch.stop_arrivals_delete_block();

ALTER TABLE dispatch.stop_arrivals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stop_arrivals_company_scope ON dispatch.stop_arrivals;
CREATE POLICY stop_arrivals_company_scope
  ON dispatch.stop_arrivals
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

REVOKE DELETE ON dispatch.stop_arrivals FROM PUBLIC;
REVOKE DELETE ON dispatch.stop_arrivals FROM ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.stop_arrivals TO ih35_app;

COMMIT;
