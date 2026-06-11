-- W3B-FORCED-DRIVER-ACK: schema, tables, RLS, indexes, spine logging
-- Blocking ACK modal in Driver PWA. Re-alarms until acknowledged.
-- Writes ack events to events.event_log via events.log_event().
-- NULLIF RLS pattern. NON-FINANCIAL.

CREATE SCHEMA IF NOT EXISTS driveralert;

-- ─── DISPATCH ────────────────────────────────────────────────────────────────
-- One row per alert sent to a driver. Tracks the full lifecycle.
CREATE TABLE IF NOT EXISTS driveralert.dispatch (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  driver_id             uuid NOT NULL,
  load_id               uuid,
  alert_type            text NOT NULL CHECK (alert_type IN (
    'safety_doc_required',
    'load_assignment',
    'detention_approval',
    'custom'
  )),
  message               text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  severity              text NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','urgent','alarm')),
  requires_ack          boolean NOT NULL DEFAULT true,
  ack_deadline_at       timestamptz,
  acked_at              timestamptz,
  acked_by_driver_id    uuid,
  ack_method            text CHECK (ack_method IN ('driver_app','office_override','timeout')),
  re_alarm_count        integer NOT NULL DEFAULT 0,
  last_re_alarmed_at    timestamptz,
  spine_event_id        uuid,
  is_active             boolean NOT NULL DEFAULT true,
  created_by_user_id    uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driveralert.dispatch ENABLE ROW LEVEL SECURITY;

CREATE POLICY driveralert_dispatch_tenant ON driveralert.dispatch
  USING (operating_company_id = NULLIF(current_setting('app.current_operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_driveralert_dispatch_driver_active
  ON driveralert.dispatch (operating_company_id, driver_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driveralert_dispatch_unacked
  ON driveralert.dispatch (operating_company_id, requires_ack, acked_at)
  WHERE acked_at IS NULL AND is_active = true;

-- ─── ALARM EVENT ─────────────────────────────────────────────────────────────
-- Immutable log of every alarm/re-alarm sent to the driver PWA.
CREATE TABLE IF NOT EXISTS driveralert.alarm_event (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL,
  dispatch_id           uuid NOT NULL REFERENCES driveralert.dispatch(id),
  event_type            text NOT NULL CHECK (event_type IN ('sent','re_alarm','acked','office_override','expired')),
  actor_type            text NOT NULL CHECK (actor_type IN ('system','driver','user')),
  actor_id              uuid,
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  payload               jsonb NOT NULL DEFAULT '{}',
  spine_event_id        uuid,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driveralert.alarm_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY driveralert_alarm_event_tenant ON driveralert.alarm_event
  USING (operating_company_id = NULLIF(current_setting('app.current_operating_company_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_driveralert_alarm_event_dispatch
  ON driveralert.alarm_event (dispatch_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_driveralert_alarm_event_company_time
  ON driveralert.alarm_event (operating_company_id, occurred_at DESC);

-- ─── updated_at TRIGGER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION driveralert.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON driveralert.dispatch;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON driveralert.dispatch
  FOR EACH ROW EXECUTE FUNCTION driveralert.set_updated_at();

-- ─── SPINE LOGGING TRIGGER ───────────────────────────────────────────────────
-- Writes every alarm_event insert to events.event_log via log_event().
CREATE OR REPLACE FUNCTION driveralert.log_alarm_to_spine()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_spine_event_id uuid;
  v_event_type text;
BEGIN
  v_event_type := 'driveralert.' || NEW.event_type;

  SELECT events.log_event(
    NEW.operating_company_id::text,
    v_event_type,
    NEW.actor_type,
    COALESCE(NEW.actor_id::text, 'system'),
    'driveralert.alarm_event',
    NEW.id::text,
    NEW.payload,
    NEW.occurred_at,
    'driveralert'
  ) INTO v_spine_event_id;

  NEW.spine_event_id := v_spine_event_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_alarm_to_spine ON driveralert.alarm_event;
CREATE TRIGGER log_alarm_to_spine
  BEFORE INSERT ON driveralert.alarm_event
  FOR EACH ROW EXECUTE FUNCTION driveralert.log_alarm_to_spine();

-- ─── GRANTS ───────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA driveralert TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON driveralert.dispatch TO ih35_app;
GRANT SELECT, INSERT ON driveralert.alarm_event TO ih35_app;
