-- GAP-70: EDI integration foundation — partners + message log (204/214/210/990).

BEGIN;

CREATE TABLE IF NOT EXISTS integrations.edi_partners (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  isa_qualifier text NOT NULL,
  isa_id text NOT NULL,
  gs_qualifier text NOT NULL,
  gs_id text NOT NULL,
  connection_type text NOT NULL CHECK (connection_type IN ('as2', 'ftp', 'sftp', 'api')),
  connection_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  supported_transactions text[] NOT NULL DEFAULT ARRAY['204', '214', '210', '990']::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations.edi_messages (
  uuid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id) ON DELETE CASCADE,
  partner_uuid uuid NOT NULL REFERENCES integrations.edi_partners(uuid) ON DELETE CASCADE,
  transaction_type text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  control_number text NOT NULL,
  payload text NOT NULL,
  parsed_payload jsonb NULL,
  related_load_uuid uuid NULL,
  status text NOT NULL CHECK (status IN ('received', 'parsed', 'processed', 'failed', 'sent', 'acknowledged')),
  error_message text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_edi_msg_partner
  ON integrations.edi_messages (partner_uuid, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_edi_msg_status
  ON integrations.edi_messages (status);

CREATE INDEX IF NOT EXISTS idx_edi_partners_company
  ON integrations.edi_partners (operating_company_id)
  WHERE is_active = true;

ALTER TABLE integrations.edi_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.edi_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS edi_partners_company_scope ON integrations.edi_partners;
CREATE POLICY edi_partners_company_scope
  ON integrations.edi_partners
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

DROP POLICY IF EXISTS edi_messages_company_scope ON integrations.edi_messages;
CREATE POLICY edi_messages_company_scope
  ON integrations.edi_messages
  FOR ALL TO ih35_app
  USING (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON integrations.edi_partners TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.edi_messages TO ih35_app;

COMMIT;
