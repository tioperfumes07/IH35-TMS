BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    ALTER TABLE mdata.loads
      ADD COLUMN IF NOT EXISTS cancel_reason text,
      ADD COLUMN IF NOT EXISTS cancel_reason_code text,
      ADD COLUMN IF NOT EXISTS canceled_by uuid,
      ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

    ALTER TABLE mdata.loads
      DROP CONSTRAINT IF EXISTS mdata_loads_cancel_reason_code_check;

    ALTER TABLE mdata.loads
      ADD CONSTRAINT mdata_loads_cancel_reason_code_check
      CHECK (
        cancel_reason_code IS NULL OR cancel_reason_code IN (
          'customer_request',
          'no_truck_available',
          'weather',
          'hos_violation',
          'equipment_failure',
          'payment_concern',
          'other'
        )
      );
  END IF;

  IF to_regclass('dispatch.loads') IS NOT NULL THEN
    ALTER TABLE dispatch.loads
      ADD COLUMN IF NOT EXISTS cancel_reason text,
      ADD COLUMN IF NOT EXISTS cancel_reason_code text,
      ADD COLUMN IF NOT EXISTS canceled_by uuid,
      ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

    ALTER TABLE dispatch.loads
      DROP CONSTRAINT IF EXISTS dispatch_loads_cancel_reason_code_check;

    ALTER TABLE dispatch.loads
      ADD CONSTRAINT dispatch_loads_cancel_reason_code_check
      CHECK (
        cancel_reason_code IS NULL OR cancel_reason_code IN (
          'customer_request',
          'no_truck_available',
          'weather',
          'hos_violation',
          'equipment_failure',
          'payment_concern',
          'other'
        )
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION dispatch.sync_cancel_metadata_to_loads()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL THEN
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
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_sync_cancel_metadata_to_loads ON dispatch.load_cancellations;
CREATE TRIGGER trg_sync_cancel_metadata_to_loads
AFTER INSERT OR UPDATE ON dispatch.load_cancellations
FOR EACH ROW
EXECUTE FUNCTION dispatch.sync_cancel_metadata_to_loads();

COMMIT;
