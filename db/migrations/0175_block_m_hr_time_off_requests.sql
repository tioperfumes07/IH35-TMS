-- Block M — HR time-off requests (driver PWA + office approval).

BEGIN;

CREATE SCHEMA IF NOT EXISTS hr;

CREATE TABLE IF NOT EXISTS hr.time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES mdata.drivers(id) ON DELETE CASCADE,
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('vacation', 'sick', 'personal')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES identity.users(id),
  decision_notes TEXT
);

CREATE INDEX IF NOT EXISTS ix_time_off_company_status ON hr.time_off_requests (operating_company_id, status);
CREATE INDEX IF NOT EXISTS ix_time_off_driver_created ON hr.time_off_requests (driver_id, created_at DESC);

ALTER TABLE hr.time_off_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS time_off_requests_company_scope ON hr.time_off_requests;
CREATE POLICY time_off_requests_company_scope
  ON hr.time_off_requests
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT USAGE ON SCHEMA hr TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hr.time_off_requests TO ih35_app;

COMMIT;
