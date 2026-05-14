-- P6-T11199 — QBO sync runs retry/backoff + accounting outbox bridge + WO fuel cents (additive).

BEGIN;

ALTER TABLE qbo.sync_runs
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0 AND retry_count <= 32),
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_letter_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  conname text;
BEGIN
  IF to_regclass('qbo.sync_runs') IS NULL THEN
    RAISE NOTICE 'Skipping qbo.sync_runs constraint rewrite — table missing';
    RETURN;
  END IF;

  SELECT c.conname
    INTO conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'qbo'
     AND t.relname = 'sync_runs'
     AND c.contype = 'c'
     AND pg_get_constraintdef(c.oid) ILIKE '%status%'
   ORDER BY c.conname
   LIMIT 1;

  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE qbo.sync_runs DROP CONSTRAINT %I', conname);
  END IF;

  ALTER TABLE qbo.sync_runs
    ADD CONSTRAINT sync_runs_status_check CHECK (
      status IN ('pending', 'running', 'success', 'failed', 'cancelled', 'dead_letter')
    );
END
$$;

CREATE INDEX IF NOT EXISTS ix_sync_runs_next_retry
  ON qbo.sync_runs (next_retry_at)
  WHERE status IN ('pending', 'failed');

CREATE TABLE IF NOT EXISTS qbo.sync_dead_letter_email_throttle (
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  kind TEXT NOT NULL,
  alert_day DATE NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (operating_company_id, kind, alert_day)
);

ALTER TABLE qbo.sync_dead_letter_email_throttle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_dead_letter_email_throttle_scope ON qbo.sync_dead_letter_email_throttle;
CREATE POLICY sync_dead_letter_email_throttle_scope
  ON qbo.sync_dead_letter_email_throttle
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON qbo.sync_dead_letter_email_throttle TO ih35_app;

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS fuel_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (fuel_cost_cents >= 0);

CREATE TABLE IF NOT EXISTS accounting.outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispatched', 'failed', 'dead_letter')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_outbox_events_company_pending
  ON accounting.outbox_events (operating_company_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE accounting.outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_events_company_scope ON accounting.outbox_events;
CREATE POLICY outbox_events_company_scope
  ON accounting.outbox_events
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE ON accounting.outbox_events TO ih35_app;

COMMIT;
