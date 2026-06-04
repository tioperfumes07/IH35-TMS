-- P5-T25: QBO Payroll link table + sync state (Option B aggregation)
CREATE TABLE IF NOT EXISTS integrations.qbo_payroll_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  qbo_payroll_run_id text NOT NULL,
  qbo_payroll_run_name text NULL,
  pay_period_start date NULL,
  pay_period_end date NULL,
  gross_cents bigint NOT NULL DEFAULT 0,
  net_cents bigint NOT NULL DEFAULT 0,
  employee_count int NOT NULL DEFAULT 0,
  sync_state text NOT NULL DEFAULT 'idle',
  last_synced_at timestamptz NULL,
  archived_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, qbo_payroll_run_id)
);

CREATE INDEX IF NOT EXISTS ix_qbo_payroll_links_company
  ON integrations.qbo_payroll_links (operating_company_id)
  WHERE archived_at IS NULL;

COMMENT ON TABLE integrations.qbo_payroll_links IS 'Read-side mirror of QBO Payroll W-2 runs for TMS aggregation page (Option B).';
