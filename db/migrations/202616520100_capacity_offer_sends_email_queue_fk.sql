-- 202616520100_capacity_offer_sends_email_queue_fk.sql
-- E5 (CC-1, 2026-11-12): add FK for dispatch.capacity_offer_sends.email_queue_id → email.email_queue(id).
-- The capacity migration (202616480100) added the column without an inline FK because the FK needs to
-- reference email.email_queue, which may not be guaranteed to exist in the same transaction on all
-- environments. Idempotent: DO block guards against re-adding an already-present constraint.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'dispatch.capacity_offer_sends'::regclass
       AND conname = 'capacity_offer_sends_email_queue_fk'
  ) THEN
    ALTER TABLE dispatch.capacity_offer_sends
      ADD CONSTRAINT capacity_offer_sends_email_queue_fk
      FOREIGN KEY (email_queue_id) REFERENCES email.email_queue(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
