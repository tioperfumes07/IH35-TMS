-- DS-REMEDIATE-5: support idempotent reconciliation alert enqueue.
BEGIN;

ALTER TABLE outbox.events
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_outbox_events_dedupe_key
  ON outbox.events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('audit.allowed_event_classes') IS NOT NULL THEN
    INSERT INTO audit.allowed_event_classes (event_class)
    VALUES
      ('alert_enqueued'),
      ('alert_recipient_missing')
    ON CONFLICT (event_class) DO NOTHING;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON outbox.events TO ih35_app;

COMMIT;
