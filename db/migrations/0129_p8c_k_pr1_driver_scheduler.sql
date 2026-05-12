BEGIN;

-- Block K PR1 — Driver scheduler schema (leave requests, days, temp cover, policies, balances)
-- Migration 0129 (agent-2 odd series). Idempotent, non-destructive.

CREATE TABLE IF NOT EXISTS catalogs.leave_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  vacation_days_per_year integer NOT NULL DEFAULT 10 CHECK (vacation_days_per_year >= 0),
  sick_days_per_year integer NOT NULL DEFAULT 5 CHECK (sick_days_per_year >= 0),
  personal_days_per_year integer NOT NULL DEFAULT 5 CHECK (personal_days_per_year >= 0),
  vacation_advance_notice_days integer NOT NULL DEFAULT 14 CHECK (vacation_advance_notice_days >= 0),
  personal_advance_notice_days integer NOT NULL DEFAULT 3 CHECK (personal_advance_notice_days >= 0),
  sick_requires_doc_after_days integer NOT NULL DEFAULT 1 CHECK (sick_requires_doc_after_days >= 0),
  carryover_vacation_days_max integer NOT NULL DEFAULT 0 CHECK (carryover_vacation_days_max >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES identity.users(id),
  UNIQUE (operating_company_id)
);

CREATE INDEX IF NOT EXISTS idx_catalogs_leave_policies_company
  ON catalogs.leave_policies (operating_company_id);

CREATE TABLE IF NOT EXISTS catalogs.driver_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  plan_year integer NOT NULL CHECK (plan_year >= 2000 AND plan_year <= 2100),
  vacation_allocated integer NOT NULL DEFAULT 0 CHECK (vacation_allocated >= 0),
  vacation_used integer NOT NULL DEFAULT 0 CHECK (vacation_used >= 0),
  sick_allocated integer NOT NULL DEFAULT 0 CHECK (sick_allocated >= 0),
  sick_used integer NOT NULL DEFAULT 0 CHECK (sick_used >= 0),
  personal_allocated integer NOT NULL DEFAULT 0 CHECK (personal_allocated >= 0),
  personal_used integer NOT NULL DEFAULT 0 CHECK (personal_used >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, driver_id, plan_year)
);

CREATE INDEX IF NOT EXISTS idx_driver_leave_balances_lookup
  ON catalogs.driver_leave_balances (operating_company_id, driver_id, plan_year DESC);

CREATE TABLE IF NOT EXISTS safety.driver_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  request_number text NOT NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('vacation', 'sick', 'personal', 'wfh')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  documentation_attachment_id uuid REFERENCES documents.attachments(id),
  suggested_cover_driver_id uuid REFERENCES mdata.drivers(id),
  status text NOT NULL DEFAULT 'pending_review' CHECK (
    status IN ('pending_review', 'approved', 'denied', 'deferred', 'cancelled')
  ),
  approved_start_date date,
  approved_end_date date,
  reviewed_by_user_id uuid REFERENCES identity.users(id),
  reviewed_at timestamptz,
  review_action text CHECK (
    review_action IS NULL OR review_action IN ('approve', 'approve_modified', 'deny', 'defer')
  ),
  denial_reason text,
  modification_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  CONSTRAINT chk_leave_dates_order CHECK (end_date >= start_date),
  UNIQUE (operating_company_id, request_number)
);

CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_company_status
  ON safety.driver_leave_requests (operating_company_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_driver_leave_requests_driver
  ON safety.driver_leave_requests (operating_company_id, driver_id, created_at DESC);

CREATE TABLE IF NOT EXISTS safety.driver_leave_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  leave_request_id uuid NOT NULL REFERENCES safety.driver_leave_requests(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  leave_date date NOT NULL,
  leave_type text NOT NULL CHECK (leave_type IN ('vacation', 'sick', 'personal', 'wfh')),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_leave_days_active
  ON safety.driver_leave_days (driver_id, leave_date)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_driver_leave_days_company_date
  ON safety.driver_leave_days (operating_company_id, leave_date);

CREATE TABLE IF NOT EXISTS safety.temp_unit_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  unit_id uuid NOT NULL REFERENCES mdata.units(id),
  primary_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  cover_driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  start_date date NOT NULL,
  end_date date NOT NULL,
  related_leave_request_id uuid REFERENCES safety.driver_leave_requests(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES identity.users(id),
  void_reason text,
  CONSTRAINT chk_temp_cover_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_temp_unit_assignments_company
  ON safety.temp_unit_assignments (operating_company_id, start_date, end_date)
  WHERE voided_at IS NULL;

CREATE TABLE IF NOT EXISTS safety.driver_leave_audit_log (
  id bigserial PRIMARY KEY,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  leave_request_id uuid REFERENCES safety.driver_leave_requests(id),
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES identity.users(id),
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_leave_audit_company_time
  ON safety.driver_leave_audit_log (operating_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_leave_audit_request
  ON safety.driver_leave_audit_log (leave_request_id, created_at DESC);

-- Append-only audit
CREATE OR REPLACE FUNCTION safety.block_driver_leave_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'safety.driver_leave_audit_log is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_driver_leave_audit_update ON safety.driver_leave_audit_log;
CREATE TRIGGER trg_block_driver_leave_audit_update
BEFORE UPDATE ON safety.driver_leave_audit_log
FOR EACH ROW
EXECUTE FUNCTION safety.block_driver_leave_audit_mutation();

DROP TRIGGER IF EXISTS trg_block_driver_leave_audit_delete ON safety.driver_leave_audit_log;
CREATE TRIGGER trg_block_driver_leave_audit_delete
BEFORE DELETE ON safety.driver_leave_audit_log
FOR EACH ROW
EXECUTE FUNCTION safety.block_driver_leave_audit_mutation();

REVOKE UPDATE, DELETE ON safety.driver_leave_audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON safety.driver_leave_audit_log FROM ih35_app;

ALTER TABLE catalogs.leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.driver_leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.driver_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.driver_leave_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.temp_unit_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.driver_leave_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_leave_policies_isolation ON catalogs.leave_policies;
CREATE POLICY rls_leave_policies_isolation ON catalogs.leave_policies
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_driver_leave_balances_isolation ON catalogs.driver_leave_balances;
CREATE POLICY rls_driver_leave_balances_isolation ON catalogs.driver_leave_balances
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_driver_leave_requests_isolation ON safety.driver_leave_requests;
CREATE POLICY rls_driver_leave_requests_isolation ON safety.driver_leave_requests
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_driver_leave_days_isolation ON safety.driver_leave_days;
CREATE POLICY rls_driver_leave_days_isolation ON safety.driver_leave_days
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_temp_unit_assignments_isolation ON safety.temp_unit_assignments;
CREATE POLICY rls_temp_unit_assignments_isolation ON safety.temp_unit_assignments
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_driver_leave_audit_isolation ON safety.driver_leave_audit_log;
CREATE POLICY rls_driver_leave_audit_isolation ON safety.driver_leave_audit_log
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.leave_policies TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.driver_leave_balances TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety.driver_leave_requests TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety.driver_leave_days TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON safety.temp_unit_assignments TO ih35_app;
GRANT SELECT, INSERT ON safety.driver_leave_audit_log TO ih35_app;
GRANT USAGE, SELECT ON SEQUENCE safety.driver_leave_audit_log_id_seq TO ih35_app;

-- Seed default policies (one row per company)
INSERT INTO catalogs.leave_policies (
  operating_company_id,
  vacation_days_per_year,
  sick_days_per_year,
  personal_days_per_year,
  vacation_advance_notice_days,
  personal_advance_notice_days,
  sick_requires_doc_after_days
)
SELECT
  c.id,
  10,
  5,
  5,
  14,
  3,
  1
FROM org.companies c
ON CONFLICT (operating_company_id) DO NOTHING;

COMMIT;
