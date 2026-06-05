BEGIN;
ALTER TABLE accounting.bill_payments ADD COLUMN IF NOT EXISTS cc_account_id uuid NULL REFERENCES catalogs.accounts(id);
CREATE INDEX IF NOT EXISTS ix_bill_payments_cc_account ON accounting.bill_payments (operating_company_id, cc_account_id) WHERE cc_account_id IS NOT NULL AND revoked_at IS NULL;
COMMIT;
