BEGIN;

CREATE SCHEMA IF NOT EXISTS banking;

GRANT USAGE ON SCHEMA banking TO ih35_app;

CREATE TABLE IF NOT EXISTS banking.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  transfer_type text NOT NULL CHECK (transfer_type IN ('bank_to_bank', 'cc_payment', 'cash_deposit', 'owner_contribution', 'owner_distribution')),
  from_account_id uuid NOT NULL,
  from_account_kind text NOT NULL CHECK (from_account_kind IN ('bank', 'cc', 'coa')),
  to_account_id uuid NOT NULL,
  to_account_kind text NOT NULL CHECK (to_account_kind IN ('bank', 'cc', 'coa')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  transfer_date date NOT NULL DEFAULT CURRENT_DATE,
  memo text,
  reference_number text,
  qbo_journal_entry_id text,
  created_by_user_id uuid NOT NULL REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES identity.users(id),
  revoked_reason text
);

CREATE INDEX IF NOT EXISTS idx_banking_transfers_company_date
  ON banking.transfers (operating_company_id, transfer_date DESC);

CREATE INDEX IF NOT EXISTS idx_banking_transfers_from_account_active
  ON banking.transfers (from_account_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_banking_transfers_to_account_active
  ON banking.transfers (to_account_id)
  WHERE revoked_at IS NULL;

ALTER TABLE banking.transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transfers_company_scope ON banking.transfers;
CREATE POLICY transfers_company_scope
  ON banking.transfers
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON banking.transfers TO ih35_app;

DO $$
DECLARE
  entity_type_constraint text;
BEGIN
  IF to_regclass('integrations.qbo_sync_queue') IS NULL THEN
    RETURN;
  END IF;

  SELECT c.conname
  INTO entity_type_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'integrations'
    AND t.relname = 'qbo_sync_queue'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%entity_type%';

  IF entity_type_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE integrations.qbo_sync_queue DROP CONSTRAINT %I', entity_type_constraint);
  END IF;

  ALTER TABLE integrations.qbo_sync_queue
    ADD CONSTRAINT qbo_sync_queue_entity_type_check
    CHECK (entity_type IN ('bank_transaction','bill','expense','invoice','journal_entry','settlement','transfer'));
END
$$;

COMMIT;

