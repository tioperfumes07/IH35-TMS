BEGIN;

-- Block J PR1 — Cash advance *request* workflow + append-only audit.
-- Approve path books via createDriverCashAdvanceCore (shared with /api/v1/cash-advances).
-- Agent-2 odd series. Idempotent, non-destructive.

CREATE OR REPLACE FUNCTION driver_finance.touch_cash_advance_request_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS driver_finance.cash_advance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  driver_id uuid NOT NULL REFERENCES mdata.drivers(id),
  display_id text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  submitted_via text NOT NULL CHECK (submitted_via IN ('pwa', 'office', 'phone')),
  requested_amount_cents bigint NOT NULL CHECK (requested_amount_cents > 0),
  reason text NOT NULL CHECK (length(trim(reason)) >= 10),
  proposed_recovery_per_settlement_cents bigint NULL CHECK (
    proposed_recovery_per_settlement_cents IS NULL OR proposed_recovery_per_settlement_cents > 0
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'under_review', 'approved', 'denied', 'expired', 'cancelled_by_driver')
  ),
  reviewed_by_user_id uuid NULL REFERENCES identity.users(uuid),
  reviewed_at timestamptz NULL,
  approval_notes text NULL,
  denial_reason text NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  linked_advance_id uuid NULL REFERENCES driver_finance.driver_advances(id),
  is_above_policy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, display_id)
);

DROP TRIGGER IF EXISTS trg_cash_adv_req_touch_updated ON driver_finance.cash_advance_requests;
CREATE TRIGGER trg_cash_adv_req_touch_updated
BEFORE UPDATE ON driver_finance.cash_advance_requests
FOR EACH ROW
EXECUTE FUNCTION driver_finance.touch_cash_advance_request_updated_at();

CREATE INDEX IF NOT EXISTS idx_cash_adv_req_company_status_exp
  ON driver_finance.cash_advance_requests (operating_company_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_cash_adv_req_driver
  ON driver_finance.cash_advance_requests (operating_company_id, driver_id, created_at DESC);

CREATE TABLE IF NOT EXISTS driver_finance.cash_advance_request_audit (
  id bigserial PRIMARY KEY,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  request_id uuid NOT NULL REFERENCES driver_finance.cash_advance_requests(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES identity.users(uuid),
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_adv_req_audit_company_time
  ON driver_finance.cash_advance_request_audit (operating_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_adv_req_audit_request
  ON driver_finance.cash_advance_request_audit (request_id, created_at DESC);

CREATE OR REPLACE FUNCTION driver_finance.block_cash_advance_request_audit_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'driver_finance.cash_advance_request_audit is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_cash_adv_req_audit_update ON driver_finance.cash_advance_request_audit;
CREATE TRIGGER trg_block_cash_adv_req_audit_update
BEFORE UPDATE ON driver_finance.cash_advance_request_audit
FOR EACH ROW
EXECUTE FUNCTION driver_finance.block_cash_advance_request_audit_mutate();

DROP TRIGGER IF EXISTS trg_block_cash_adv_req_audit_delete ON driver_finance.cash_advance_request_audit;
CREATE TRIGGER trg_block_cash_adv_req_audit_delete
BEFORE DELETE ON driver_finance.cash_advance_request_audit
FOR EACH ROW
EXECUTE FUNCTION driver_finance.block_cash_advance_request_audit_mutate();

REVOKE UPDATE, DELETE ON driver_finance.cash_advance_request_audit FROM PUBLIC;
REVOKE UPDATE, DELETE ON driver_finance.cash_advance_request_audit FROM ih35_app;

ALTER TABLE driver_finance.cash_advance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.cash_advance_request_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_cash_adv_req_isolation ON driver_finance.cash_advance_requests;
CREATE POLICY rls_cash_adv_req_isolation ON driver_finance.cash_advance_requests
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_cash_adv_req_audit_isolation ON driver_finance.cash_advance_request_audit;
CREATE POLICY rls_cash_adv_req_audit_isolation ON driver_finance.cash_advance_request_audit
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT USAGE ON SCHEMA driver_finance TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON driver_finance.cash_advance_requests TO ih35_app;
    GRANT SELECT, INSERT ON driver_finance.cash_advance_request_audit TO ih35_app;
    IF to_regclass('driver_finance.cash_advance_request_audit_id_seq') IS NOT NULL THEN
      GRANT USAGE, SELECT ON SEQUENCE driver_finance.cash_advance_request_audit_id_seq TO ih35_app;
    END IF;
  END IF;
END
$$;

COMMIT;
