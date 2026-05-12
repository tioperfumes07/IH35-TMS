BEGIN;

-- Block I / Phase 8C — Legal matters (lawsuits, claims, deadlines). Migration 0133 (v2; 0132 burned on reverted PR #15).
-- Idempotent. RLS via app.operating_company_id (matches existing legal.* pattern).

CREATE TABLE IF NOT EXISTS legal.matters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  matter_number text NOT NULL,
  type text NOT NULL CHECK (type IN (
    'lawsuit',
    'claim',
    'demand_letter',
    'settlement',
    'regulatory',
    'other'
  )),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open',
    'investigating',
    'litigation',
    'settled',
    'dismissed',
    'judgment',
    'closed'
  )),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  our_role text NOT NULL DEFAULT 'defendant' CHECK (our_role IN (
    'defendant',
    'plaintiff',
    'third_party',
    'other'
  )),
  opposing_party text,
  case_number text,
  court text,
  description text,
  internal_notes text,
  amount_claimed_against_us numeric(14, 2),
  amount_we_seek numeric(14, 2),
  financial_reserve_cents bigint CHECK (financial_reserve_cents IS NULL OR financial_reserve_cents >= 0),
  next_hearing_date date,
  statute_of_limitations_at date,
  attorney_name text,
  attorney_firm text,
  attorney_phone text,
  attorney_email text,
  related_user_id uuid REFERENCES identity.users(id),
  related_driver_id uuid REFERENCES mdata.drivers(id),
  outcome_summary text,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES identity.users(id),
  created_by_user_id uuid REFERENCES identity.users(id),
  updated_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, matter_number)
);

CREATE INDEX IF NOT EXISTS idx_legal_matters_company_status
  ON legal.matters (operating_company_id, status, severity DESC);
CREATE INDEX IF NOT EXISTS idx_legal_matters_company_user
  ON legal.matters (operating_company_id, related_user_id);
CREATE INDEX IF NOT EXISTS idx_legal_matters_company_driver
  ON legal.matters (operating_company_id, related_driver_id);

DROP TRIGGER IF EXISTS trg_legal_matters_set_updated_at ON legal.matters;
CREATE TRIGGER trg_legal_matters_set_updated_at
BEFORE UPDATE ON legal.matters
FOR EACH ROW
EXECUTE FUNCTION legal.set_updated_at();

CREATE TABLE IF NOT EXISTS legal.matter_events (
  id bigserial PRIMARY KEY,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  matter_id uuid NOT NULL REFERENCES legal.matters(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_matter_events_matter
  ON legal.matter_events (matter_id, id ASC);
CREATE INDEX IF NOT EXISTS idx_legal_matter_events_company_time
  ON legal.matter_events (operating_company_id, created_at DESC);

CREATE OR REPLACE FUNCTION legal.block_matter_events_mutate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'legal.matter_events is append-only — % is not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_matter_events_update ON legal.matter_events;
CREATE TRIGGER trg_block_matter_events_update
BEFORE UPDATE ON legal.matter_events
FOR EACH ROW
EXECUTE FUNCTION legal.block_matter_events_mutate();

DROP TRIGGER IF EXISTS trg_block_matter_events_delete ON legal.matter_events;
CREATE TRIGGER trg_block_matter_events_delete
BEFORE DELETE ON legal.matter_events
FOR EACH ROW
EXECUTE FUNCTION legal.block_matter_events_mutate();

REVOKE UPDATE, DELETE ON legal.matter_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON legal.matter_events FROM ih35_app;

CREATE TABLE IF NOT EXISTS legal.matter_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  matter_id uuid NOT NULL REFERENCES legal.matters(id) ON DELETE RESTRICT,
  title text NOT NULL,
  is_privileged boolean NOT NULL DEFAULT false,
  r2_object_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes >= 0),
  attachment_id uuid REFERENCES documents.attachments(id),
  uploaded_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_matter_documents_matter
  ON legal.matter_documents (matter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS legal.matter_deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  matter_id uuid NOT NULL REFERENCES legal.matters(id) ON DELETE RESTRICT,
  deadline_type text NOT NULL CHECK (deadline_type IN (
    'statute_of_limitations',
    'response',
    'hearing',
    'filing',
    'other'
  )),
  title text NOT NULL,
  deadline_at timestamptz NOT NULL,
  reminder_offset_days integer NOT NULL DEFAULT 7 CHECK (reminder_offset_days >= 0 AND reminder_offset_days <= 365),
  reminder_recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  reminder_sent_at timestamptz[] NOT NULL DEFAULT ARRAY[]::timestamptz[],
  completed_at timestamptz,
  completed_by_user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_matter_deadlines_company_due
  ON legal.matter_deadlines (operating_company_id, deadline_at);
CREATE INDEX IF NOT EXISTS idx_legal_matter_deadlines_open
  ON legal.matter_deadlines (operating_company_id, completed_at, deadline_at)
  WHERE completed_at IS NULL;

ALTER TABLE legal.matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.matter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.matter_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal.matter_deadlines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_legal_matters_isolation ON legal.matters;
CREATE POLICY rls_legal_matters_isolation ON legal.matters
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_legal_matter_events_isolation ON legal.matter_events;
CREATE POLICY rls_legal_matter_events_isolation ON legal.matter_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_legal_matter_documents_isolation ON legal.matter_documents;
CREATE POLICY rls_legal_matter_documents_isolation ON legal.matter_documents
  FOR ALL TO ih35_app
  USING (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = current_setting('app.operating_company_id', true)::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS rls_legal_matter_deadlines_isolation ON legal.matter_deadlines;
CREATE POLICY rls_legal_matter_deadlines_isolation ON legal.matter_deadlines
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
  IF to_regnamespace('legal') IS NOT NULL THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA legal GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA legal GRANT USAGE ON SEQUENCES TO ih35_app;
    GRANT USAGE ON SCHEMA legal TO ih35_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON legal.matters TO ih35_app;
    GRANT SELECT, INSERT ON legal.matter_events TO ih35_app;
    GRANT SELECT, INSERT ON legal.matter_documents TO ih35_app;
    GRANT SELECT, INSERT, UPDATE ON legal.matter_deadlines TO ih35_app;
    IF to_regclass('legal.matter_events_id_seq') IS NOT NULL THEN
      GRANT USAGE, SELECT ON SEQUENCE legal.matter_events_id_seq TO ih35_app;
    END IF;
  END IF;
END
$$;

ALTER TABLE legal.contract_instances
  ADD COLUMN IF NOT EXISTS void_legal_matter_id uuid REFERENCES legal.matters(id);

CREATE INDEX IF NOT EXISTS idx_legal_contract_instances_void_matter
  ON legal.contract_instances (void_legal_matter_id)
  WHERE void_legal_matter_id IS NOT NULL;

COMMIT;
