BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'mdata'
      AND t.relname = 'driver_safety_events'
      AND c.conname = 'fk_driver_safety_events_related_load'
  ) THEN
    ALTER TABLE mdata.driver_safety_events
      ADD CONSTRAINT fk_driver_safety_events_related_load
      FOREIGN KEY (related_load_id)
      REFERENCES mdata.loads(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'mdata'
      AND t.relname = 'dispatcher_safety_events'
      AND c.conname = 'fk_dispatcher_safety_events_related_load'
  ) THEN
    ALTER TABLE mdata.dispatcher_safety_events
      ADD CONSTRAINT fk_dispatcher_safety_events_related_load
      FOREIGN KEY (related_load_id)
      REFERENCES mdata.loads(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'mdata'
      AND t.relname = 'customer_quality_events'
      AND c.conname = 'fk_customer_quality_events_related_load'
  ) THEN
    ALTER TABLE mdata.customer_quality_events
      ADD CONSTRAINT fk_customer_quality_events_related_load
      FOREIGN KEY (related_load_id)
      REFERENCES mdata.loads(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END
$$;

COMMIT;
