-- LEAD 443.114 (AJK-12 ruling, 2026-10-12): a fine dismissed (e.g. in court) clears the driver charge in ONE action.
-- The dismiss route voids the driver liability through the one liability void engine
-- (apps/backend/src/liabilities/driver-liability-void.service.ts) and THEN marks the fine dismissed, in one transaction.
--
-- safety.enforce_fine_lock_after_conversion (migration 0050; the table is now safety.civil_fines) locks a converted
-- fine: its facts never change, and its status may only move to 'paid' or 'reduced'. Two narrow exceptions are added;
-- every other rule is restated unchanged from the prod definition (pg_get_functiondef, read-only, 2026-10-12):
--   1. status -> 'dismissed' is allowed ONLY when the fine's converted driver liability is VOIDED
--      (driver_finance.driver_liabilities.voided_at IS NOT NULL). While the liability is live the dismissal is still
--      refused, so a dismissed fine can never leave the driver owing it.
--   2. converted_to_liability_id may be CLEARED (set NULL) ONLY when the liability it points at does not exist
--      (a dangling pointer, e.g. a liability removed by a governed purge). Any other change of the pointer on a
--      converted fine is refused — 0050 did not check the pointer at all, so this is stricter than before.
-- Idempotent: CREATE OR REPLACE; the trigger binding is unchanged.

CREATE OR REPLACE FUNCTION safety.enforce_fine_lock_after_conversion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.converted_to_liability_id IS NOT NULL THEN
    IF NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
       OR NEW.violation_description IS DISTINCT FROM OLD.violation_description
       OR NEW.violation_code IS DISTINCT FROM OLD.violation_code
       OR NEW.issued_date IS DISTINCT FROM OLD.issued_date
       OR NEW.subject_driver_id IS DISTINCT FROM OLD.subject_driver_id
       OR NEW.subject_type IS DISTINCT FROM OLD.subject_type THEN
      RAISE EXCEPTION 'E_FINE_LOCKED_AFTER_CONVERSION';
    END IF;

    -- 443.114 exception 2: the converted pointer is cleared only when its liability no longer exists.
    IF NEW.converted_to_liability_id IS DISTINCT FROM OLD.converted_to_liability_id THEN
      IF NEW.converted_to_liability_id IS NOT NULL
         OR EXISTS (SELECT 1 FROM driver_finance.driver_liabilities l WHERE l.id = OLD.converted_to_liability_id) THEN
        RAISE EXCEPTION 'E_FINE_LOCKED_AFTER_CONVERSION';
      END IF;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status NOT IN ('paid','reduced')
       -- 443.114 exception 1: dismissed only once the converted driver liability is voided.
       AND NOT (
         NEW.status = 'dismissed'
         AND EXISTS (
           SELECT 1 FROM driver_finance.driver_liabilities l
            WHERE l.id = OLD.converted_to_liability_id
              AND l.voided_at IS NOT NULL
         )
       ) THEN
      RAISE EXCEPTION 'E_FINE_LOCKED_AFTER_CONVERSION';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

COMMENT ON FUNCTION safety.enforce_fine_lock_after_conversion() IS
  'Locks a converted civil fine. OLD (0050): facts frozen; status only -> paid/reduced; pointer unchecked. '
  'NEW (LEAD 443.114, 2026-10-12): also status -> dismissed ONLY when its driver liability is voided; the converted '
  'pointer may only be cleared, and only when its liability does not exist. WHY: a fine dismissed in court must clear '
  'the driver charge in one action (the dismiss route voids the liability through the one void engine, then dismisses) '
  'without ever leaving a dismissed fine whose driver debt is still live; and a dangling pointer (liability purged) '
  'must be clearable through the Owner route without unlocking anything else.';
