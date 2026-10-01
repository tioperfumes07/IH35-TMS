-- 202615180900_load_cancellation_reversal.sql
-- ROUND 313 CC-3 item 5 (claim #23786). A cancellation that turns out to be wrong had no canonical undo:
-- 2026-09-28 the AUTH-093 script cancelled 13625/13627/13638, ROUND-155.26 put their status back 12 minutes
-- later, but dispatch.load_cancellations stayed 'approved' and the 0281 sync trigger had already copied
-- cancelled_at / cancelled_by_user_id onto mdata.loads.canceled_at / canceled_by -- and nothing ever clears them.
-- Three live dispatched loads have read as "cancelled" ever since.
--
-- Fix at the root:
--   1. load_cancellations.status gains 'reversed' (+ reversed_at / reversed_by_user_id / reversal_reason).
--      Nothing is deleted: the cancellation row stays as history, marked reversed (void = reversal).
--   2. The sync trigger, on a row reaching 'reversed', CLEARS the load's cancel stamp (only when the load still
--      carries THIS cancellation's stamp), instead of re-copying it.
-- Additive: no column dropped, no existing value rewritten by this migration.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE dispatch.load_cancellations
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS reversal_reason text NULL;

ALTER TABLE dispatch.load_cancellations DROP CONSTRAINT IF EXISTS load_cancellations_status_check;
ALTER TABLE dispatch.load_cancellations
  ADD CONSTRAINT load_cancellations_status_check
  CHECK (status = ANY (ARRAY['requested'::text, 'approved'::text, 'rejected'::text, 'reversed'::text]));

ALTER TABLE dispatch.load_cancellations DROP CONSTRAINT IF EXISTS load_cancellations_reversal_complete;
ALTER TABLE dispatch.load_cancellations
  ADD CONSTRAINT load_cancellations_reversal_complete
  CHECK (status <> 'reversed'
         OR (reversed_at IS NOT NULL AND reversed_by_user_id IS NOT NULL AND length(btrim(coalesce(reversal_reason, ''))) >= 10));

CREATE OR REPLACE FUNCTION dispatch.sync_cancel_metadata_to_loads()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('mdata.loads') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reversal: clear the stamp this cancellation put on the load -- and only that stamp (a later, different
  -- cancellation's stamp is left alone).
  IF NEW.status = 'reversed' THEN
    UPDATE mdata.loads
       SET canceled_at = NULL,
           canceled_by = NULL,
           cancel_reason = NULL,
           cancel_reason_code = NULL,
           updated_at = now()
     WHERE id = NEW.load_id
       AND canceled_at IS NOT DISTINCT FROM NEW.cancelled_at;
    RETURN NEW;
  END IF;

  UPDATE mdata.loads
  SET
    cancel_reason = COALESCE(NULLIF(trim(NEW.cancellation_notes), ''), cancel_reason),
    cancel_reason_code = CASE
      WHEN NEW.reason_code IN (
        'customer_request',
        'no_truck_available',
        'weather',
        'hos_violation',
        'equipment_failure',
        'payment_concern',
        'other'
      ) THEN NEW.reason_code
      ELSE COALESCE(cancel_reason_code, 'other')
    END,
    canceled_by = COALESCE(NEW.cancelled_by_user_id, canceled_by),
    canceled_at = COALESCE(NEW.cancelled_at, canceled_at),
    updated_at = now()
  WHERE id = NEW.load_id;
  RETURN NEW;
END
$$;

COMMENT ON COLUMN dispatch.load_cancellations.reversed_at IS
  '202615180900: when a wrong cancellation was reversed (status=reversed). The row is kept as history; the trigger clears the load''s cancel stamp.';

COMMIT;
