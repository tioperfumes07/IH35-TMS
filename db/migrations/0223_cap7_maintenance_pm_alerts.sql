BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;

CREATE TABLE IF NOT EXISTS maintenance.pm_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  label text NOT NULL,
  interval_kind text NOT NULL CHECK (interval_kind IN ('miles', 'hours', 'days')),
  interval_value integer NOT NULL CHECK (interval_value > 0),
  last_service_odometer integer NULL CHECK (last_service_odometer IS NULL OR last_service_odometer >= 0),
  next_due_odometer integer NULL CHECK (next_due_odometer IS NULL OR next_due_odometer >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_uuid uuid NULL REFERENCES identity.users(id)
);

ALTER TABLE maintenance.pm_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_schedules_company_scope ON maintenance.pm_schedules;
CREATE POLICY pm_schedules_company_scope
  ON maintenance.pm_schedules
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON maintenance.pm_schedules TO ih35_app;

CREATE TABLE IF NOT EXISTS maintenance.pm_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  pm_schedule_id uuid NOT NULL,
  trigger_odometer integer NOT NULL CHECK (trigger_odometer >= 0),
  triggered_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'acknowledged', 'scheduled', 'dismissed')),
  acknowledged_by_user_uuid uuid NULL REFERENCES identity.users(id),
  scheduled_work_order_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF to_regclass('maintenance.pm_schedules') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_pm_alerts_schedule'
        AND conrelid = 'maintenance.pm_alerts'::regclass
    ) THEN
      ALTER TABLE maintenance.pm_alerts
        ADD CONSTRAINT fk_pm_alerts_schedule
        FOREIGN KEY (pm_schedule_id) REFERENCES maintenance.pm_schedules(id);
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('maintenance.work_orders') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'fk_pm_alerts_work_order'
        AND conrelid = 'maintenance.pm_alerts'::regclass
    ) THEN
      ALTER TABLE maintenance.pm_alerts
        ADD CONSTRAINT fk_pm_alerts_work_order
        FOREIGN KEY (scheduled_work_order_id) REFERENCES maintenance.work_orders(id);
    END IF;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_pm_alerts_lookup
  ON maintenance.pm_alerts (operating_company_id, unit_id, state, triggered_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pm_alerts_open_per_schedule
  ON maintenance.pm_alerts (operating_company_id, unit_id, pm_schedule_id)
  WHERE state = 'open';

CREATE OR REPLACE FUNCTION maintenance.pm_alerts_update_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.operating_company_id <> NEW.operating_company_id
     OR OLD.unit_id <> NEW.unit_id
     OR OLD.pm_schedule_id <> NEW.pm_schedule_id
     OR OLD.trigger_odometer <> NEW.trigger_odometer
     OR OLD.triggered_at <> NEW.triggered_at
     OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'maintenance.pm_alerts immutable columns cannot be updated';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_alerts_update_guard ON maintenance.pm_alerts;
CREATE TRIGGER trg_pm_alerts_update_guard
BEFORE UPDATE ON maintenance.pm_alerts
FOR EACH ROW
EXECUTE FUNCTION maintenance.pm_alerts_update_guard();

CREATE OR REPLACE FUNCTION maintenance.pm_alerts_delete_block()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'maintenance.pm_alerts is append-only — DELETE is not allowed';
END;
$$;

DROP TRIGGER IF EXISTS trg_pm_alerts_delete_block ON maintenance.pm_alerts;
CREATE TRIGGER trg_pm_alerts_delete_block
BEFORE DELETE ON maintenance.pm_alerts
FOR EACH ROW
EXECUTE FUNCTION maintenance.pm_alerts_delete_block();

ALTER TABLE maintenance.pm_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pm_alerts_company_scope ON maintenance.pm_alerts;
CREATE POLICY pm_alerts_company_scope
  ON maintenance.pm_alerts
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

REVOKE DELETE ON maintenance.pm_alerts FROM PUBLIC;
REVOKE DELETE ON maintenance.pm_alerts FROM ih35_app;
GRANT SELECT, INSERT, UPDATE ON maintenance.pm_alerts TO ih35_app;

COMMIT;
