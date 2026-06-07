-- GAP-19: Detention billable manager-approval queue.
-- An approval gate on top of the existing dispatch.detention_events accrual
-- board. Managers approve/reject each accrued detention before it is bridged
-- into billing (rate_total_cents) and emitted onto the customer invoice via
-- buildInvoiceFromLoad. Additive only.
--
-- Self-contained GRANT block (Block A schema grants just merged; keep this
-- migration independent so it applies cleanly in any order).
BEGIN;

CREATE TABLE IF NOT EXISTS dispatch.detention_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  detention_event_id uuid NOT NULL REFERENCES dispatch.detention_events(id) ON DELETE CASCADE,
  load_id uuid NOT NULL REFERENCES mdata.loads(id) ON DELETE CASCADE,
  stop_id uuid NOT NULL REFERENCES mdata.load_stops(id) ON DELETE CASCADE,
  customer_id uuid NULL REFERENCES mdata.customers(id),
  billable_minutes int NOT NULL DEFAULT 0 CHECK (billable_minutes >= 0),
  rate_per_hour_cents int NOT NULL DEFAULT 0 CHECK (rate_per_hour_cents >= 0),
  amount_cents int NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'rejected', 'invoiced')),
  requested_by_user_id uuid NULL,
  reviewed_by_user_id uuid NULL,
  reviewed_at timestamptz NULL,
  rejection_reason text NULL,
  invoice_id uuid NULL,
  invoice_line_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One approval request per detention event (idempotent queue sync).
CREATE UNIQUE INDEX IF NOT EXISTS uq_detention_requests_event
  ON dispatch.detention_requests (detention_event_id);

CREATE INDEX IF NOT EXISTS idx_detention_requests_company_status
  ON dispatch.detention_requests (operating_company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_detention_requests_customer
  ON dispatch.detention_requests (operating_company_id, customer_id);

ALTER TABLE dispatch.detention_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS detention_requests_company_scope ON dispatch.detention_requests;
CREATE POLICY detention_requests_company_scope
  ON dispatch.detention_requests
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

-- Self-contained GRANT block.
GRANT USAGE ON SCHEMA dispatch TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON dispatch.detention_requests TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dispatch TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA dispatch GRANT SELECT, INSERT, UPDATE ON TABLES TO ih35_app;

COMMIT;
