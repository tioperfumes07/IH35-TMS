BEGIN;

-- Block J PR2 — Above-policy cash advance Owner approval (token portal).
-- Agent-2 odd series. Idempotent.

-- owner_approval_token stores SHA-256 hex digest of the minted secret (never store raw token).

ALTER TABLE driver_finance.cash_advance_requests
  ADD COLUMN IF NOT EXISTS owner_approval_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_approval_token text NULL,
  ADD COLUMN IF NOT EXISTS owner_approval_token_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS owner_approved_by_user_id uuid NULL REFERENCES identity.users(uuid),
  ADD COLUMN IF NOT EXISTS owner_approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS owner_decision text NULL,
  ADD COLUMN IF NOT EXISTS owner_notes text NULL,
  ADD COLUMN IF NOT EXISTS escalation_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_escalated_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_adv_req_owner_decision_chk'
  ) THEN
    ALTER TABLE driver_finance.cash_advance_requests
      ADD CONSTRAINT cash_adv_req_owner_decision_chk
      CHECK (owner_decision IS NULL OR owner_decision IN ('approved', 'denied', 'escalated'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cash_adv_req_owner_token
  ON driver_finance.cash_advance_requests (owner_approval_token)
  WHERE owner_approval_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_adv_req_owner_pending
  ON driver_finance.cash_advance_requests (operating_company_id, owner_approval_required, status)
  WHERE owner_approval_required = true AND status IN ('pending', 'under_review');

CREATE TABLE IF NOT EXISTS driver_finance.cash_advance_owner_approval_audit (
  id bigserial PRIMARY KEY,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  request_id uuid NOT NULL REFERENCES driver_finance.cash_advance_requests(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_adv_owner_appr_audit_company_time
  ON driver_finance.cash_advance_owner_approval_audit (operating_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_adv_owner_appr_audit_request
  ON driver_finance.cash_advance_owner_approval_audit (request_id, id ASC);

CREATE OR REPLACE FUNCTION driver_finance.block_cash_adv_owner_appr_audit_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'driver_finance.cash_advance_owner_approval_audit is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_cash_adv_owner_appr_audit_update
  ON driver_finance.cash_advance_owner_approval_audit;
CREATE TRIGGER trg_block_cash_adv_owner_appr_audit_update
BEFORE UPDATE ON driver_finance.cash_advance_owner_approval_audit
FOR EACH ROW
EXECUTE FUNCTION driver_finance.block_cash_adv_owner_appr_audit_mutate();

DROP TRIGGER IF EXISTS trg_block_cash_adv_owner_appr_audit_delete
  ON driver_finance.cash_advance_owner_approval_audit;
CREATE TRIGGER trg_block_cash_adv_owner_appr_audit_delete
BEFORE DELETE ON driver_finance.cash_advance_owner_approval_audit
FOR EACH ROW
EXECUTE FUNCTION driver_finance.block_cash_adv_owner_appr_audit_mutate();

REVOKE UPDATE, DELETE ON driver_finance.cash_advance_owner_approval_audit FROM PUBLIC;
REVOKE UPDATE, DELETE ON driver_finance.cash_advance_owner_approval_audit FROM ih35_app;

ALTER TABLE driver_finance.cash_advance_owner_approval_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_cash_adv_owner_appr_audit_isolation
  ON driver_finance.cash_advance_owner_approval_audit;
CREATE POLICY rls_cash_adv_owner_appr_audit_isolation
  ON driver_finance.cash_advance_owner_approval_audit
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
  IF to_regnamespace('views') IS NOT NULL
     AND to_regclass('driver_finance.cash_advance_owner_approval_audit') IS NOT NULL THEN
    EXECUTE $V$
      CREATE OR REPLACE VIEW views.cash_advance_owner_approval_audit_v
      WITH (security_invoker = true) AS
      SELECT *
      FROM driver_finance.cash_advance_owner_approval_audit
    $V$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regnamespace('driver_finance') IS NOT NULL THEN
    GRANT SELECT, INSERT ON driver_finance.cash_advance_owner_approval_audit TO ih35_app;
    IF to_regclass('driver_finance.cash_advance_owner_approval_audit_id_seq') IS NOT NULL THEN
      GRANT USAGE, SELECT ON SEQUENCE driver_finance.cash_advance_owner_approval_audit_id_seq TO ih35_app;
    END IF;
  END IF;
END $$;

COMMIT;
