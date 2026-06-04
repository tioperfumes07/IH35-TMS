-- B21-D5: Dispatch detention accrual board + billing bridge events.
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.detention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES mdata.load_stops(id) ON DELETE CASCADE,
  stop_arrival_id uuid NULL REFERENCES dispatch.stop_arrivals(id),
  unit_id uuid NULL REFERENCES mdata.units(id),
  driver_id uuid NULL REFERENCES mdata.drivers(id),
  status text NOT NULL DEFAULT 'accruing'
    CHECK (status IN ('accruing', 'closed', 'billed')),
  started_at timestamptz NOT NULL,
  stopped_at timestamptz NULL,
  free_time_minutes int NOT NULL DEFAULT 120 CHECK (free_time_minutes >= 0),
  rate_per_hour_cents int NOT NULL DEFAULT 0 CHECK (rate_per_hour_cents >= 0),
  accrued_minutes int NOT NULL DEFAULT 0 CHECK (accrued_minutes >= 0),
  accrued_amount_cents int NOT NULL DEFAULT 0 CHECK (accrued_amount_cents >= 0),
  notify_threshold_minutes int NOT NULL DEFAULT 60 CHECK (notify_threshold_minutes >= 0),
  customer_notified_at timestamptz NULL,
  billing_bridge_accessorial jsonb NULL,
  billing_bridged_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT detention_events_stopped_after_start CHECK (stopped_at IS NULL OR stopped_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_detention_events_active_stop
  ON dispatch.detention_events (operating_company_id, stop_id)
  WHERE status = 'accruing';

CREATE INDEX IF NOT EXISTS idx_detention_events_company_status
  ON dispatch.detention_events (operating_company_id, status, started_at DESC);

ALTER TABLE dispatch.detention_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detention_events_company_scope ON dispatch.detention_events;
CREATE POLICY detention_events_company_scope
  ON dispatch.detention_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON dispatch.detention_events TO ih35_app;

COMMIT;
