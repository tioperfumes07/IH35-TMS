-- Block L — supporting indexes for dashboard widgets + reports.

BEGIN;

-- Self-heal: invoice_date never existed on accounting.invoices; canonical issuance column is issue_date (0060 schema).
CREATE INDEX IF NOT EXISTS ix_invoices_company_date
  ON accounting.invoices (operating_company_id, issue_date DESC);

CREATE INDEX IF NOT EXISTS ix_mdata_loads_company_status_updated
  ON mdata.loads (operating_company_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_workorders_company_status
  ON maintenance.work_orders (operating_company_id, status);

CREATE INDEX IF NOT EXISTS ix_bank_transactions_account_posted
  ON banking.bank_transactions (bank_account_id, posted_date DESC);

CREATE INDEX IF NOT EXISTS ix_driver_settlements_driver_period
  ON driver_finance.driver_settlements (driver_id, period_start);

COMMIT;
