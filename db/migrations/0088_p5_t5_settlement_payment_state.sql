BEGIN;

ALTER TABLE org.companies
  ADD COLUMN IF NOT EXISTS auto_queue_settlement_payments boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'unpaid'
        CHECK (payment_state IN ('unpaid','queued','sent_to_bank','cleared','bounced','manual_paid')),
      ADD COLUMN IF NOT EXISTS payment_queued_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_cleared_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_bank_reference text,
      ADD COLUMN IF NOT EXISTS payment_bounced_reason text,
      ADD COLUMN IF NOT EXISTS payment_method text;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('driver_pay.settlements') IS NOT NULL THEN
    ALTER TABLE driver_pay.settlements
      ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'unpaid'
        CHECK (payment_state IN ('unpaid','queued','sent_to_bank','cleared','bounced','manual_paid')),
      ADD COLUMN IF NOT EXISTS payment_queued_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_cleared_at timestamptz,
      ADD COLUMN IF NOT EXISTS payment_bank_reference text,
      ADD COLUMN IF NOT EXISTS payment_bounced_reason text,
      ADD COLUMN IF NOT EXISTS payment_method text;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS driver_finance;

CREATE TABLE IF NOT EXISTS driver_finance.settlement_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL,
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  event_type text NOT NULL CHECK (event_type IN ('queued','sent','cleared','bounced','retried','marked_paid_manually')),
  payload jsonb,
  user_id uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_settlement_payment_events_settlement
  ON driver_finance.settlement_payment_events (operating_company_id, settlement_id, created_at DESC);

ALTER TABLE driver_finance.settlement_payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_payment_events_company_scope ON driver_finance.settlement_payment_events;
CREATE POLICY settlement_payment_events_company_scope
  ON driver_finance.settlement_payment_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT ON driver_finance.settlement_payment_events TO ih35_app;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NOT NULL THEN
    EXECUTE 'GRANT UPDATE ON driver_finance.driver_settlements TO ih35_app';
  END IF;
  IF to_regclass('driver_pay.settlements') IS NOT NULL THEN
    EXECUTE 'GRANT UPDATE ON driver_pay.settlements TO ih35_app';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION driver_finance.prevent_settlement_payment_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'driver_finance.settlement_payment_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_settlement_payment_events_no_mutation ON driver_finance.settlement_payment_events;
CREATE TRIGGER trg_settlement_payment_events_no_mutation
  BEFORE UPDATE OR DELETE ON driver_finance.settlement_payment_events
  FOR EACH ROW EXECUTE FUNCTION driver_finance.prevent_settlement_payment_event_mutation();

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
    CHECK (entity_type IN ('bank_transaction','bill','expense','invoice','journal_entry','settlement'));
END
$$;

COMMIT;

