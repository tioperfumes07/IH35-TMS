-- T11.20.6.2 cut 6 (bills): local mirror table for outbound bill pushes.
BEGIN;

CREATE TABLE IF NOT EXISTS mdata.qbo_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bill_id uuid NOT NULL REFERENCES accounting.bills(id) ON DELETE CASCADE,
  qbo_id text,
  qbo_sync_token text,
  doc_number text,
  txn_date date NOT NULL,
  due_date date,
  total_cents bigint NOT NULL DEFAULT 0,
  sync_status text NOT NULL DEFAULT 'pending',
  last_synced_at timestamptz,
  last_push_at timestamptz,
  created_in_tms boolean NOT NULL DEFAULT false,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qbo_bills_sync_status_check CHECK (sync_status IN ('pending', 'synced', 'failed')),
  CONSTRAINT uq_qbo_bills_company_bill UNIQUE (operating_company_id, bill_id),
  CONSTRAINT uq_qbo_bills_company_qbo_id UNIQUE (operating_company_id, qbo_id)
);

CREATE INDEX IF NOT EXISTS idx_qbo_bills_company_last_push
  ON mdata.qbo_bills (operating_company_id, last_push_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_qbo_bills_company_status
  ON mdata.qbo_bills (operating_company_id, sync_status);

ALTER TABLE mdata.qbo_bills ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON mdata.qbo_bills TO ih35_app;

DROP POLICY IF EXISTS qbo_bills_company_scope ON mdata.qbo_bills;
CREATE POLICY qbo_bills_company_scope ON mdata.qbo_bills
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

COMMIT;
