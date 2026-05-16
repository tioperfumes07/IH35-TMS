BEGIN;

CREATE SCHEMA IF NOT EXISTS banking;

-- Self-heal: ih35_app runs queries via SET ROLE — schema USAGE is required before table GRANTs take effect (matches sms/whatsapp in 0166_block_h_notification_queues.sql).
GRANT USAGE ON SCHEMA banking TO ih35_app;

CREATE TABLE IF NOT EXISTS banking.bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  plaid_item_id text,
  plaid_access_token text,
  plaid_account_id text,
  institution_name text,
  account_name text,
  account_type text,
  account_mask text,
  current_balance_cents bigint NOT NULL DEFAULT 0,
  available_balance_cents bigint NOT NULL DEFAULT 0,
  currency_code char(3) NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'active', 'disconnected', 'needs_reauth', 'error')),
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_company_active
  ON banking.bank_accounts (operating_company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_plaid_item
  ON banking.bank_accounts (plaid_item_id)
  WHERE plaid_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_accounts_sync_status_last_synced
  ON banking.bank_accounts (sync_status, last_synced_at)
  WHERE sync_status <> 'disconnected';

ALTER TABLE banking.bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_accounts_company_scope ON banking.bank_accounts;
CREATE POLICY bank_accounts_company_scope
  ON banking.bank_accounts
  FOR ALL TO ih35_app
  USING (operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (operating_company_id::text = current_setting('app.operating_company_id', true));

GRANT SELECT, INSERT, UPDATE ON banking.bank_accounts TO ih35_app;

COMMIT;
