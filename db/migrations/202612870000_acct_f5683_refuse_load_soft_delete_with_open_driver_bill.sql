-- ACCT-F5683 — closes the systemic half of ACCT-F214 ("a SOFT-DELETED load left a LIVE
-- $1,056.00 driver payable, and NO CODE PATH can soft-delete a load", filed 2026-08-08, board
-- row ~198). Re-verified LIVE on prod 2026-08-20 (Neon tiny-field-89581227, bypass_rls=lucia,
-- current_user asserted): the finding still reproduces exactly as filed — L-20260627-0036
-- (a8883a8d-f85b-45b0-9c60-40b12ddf7220) is soft_deleted_at='2026-07-13T21:45:26.921Z' and
-- carries TWO driver_finance.driver_bills rows: one already status='void' ($4,900.00), and one
-- still status='open' ($1,056.00, id=07360b56-a6a6-4b8c-ada1-00c3a3767199).
--
-- WHAT THIS MIGRATION DOES AND DOES NOT DO:
-- Does NOT touch the existing $1,056 orphan or decide its disposition (void vs. pay) — the
-- original finding is explicit that this is a business decision (a driver may genuinely have
-- earned pay before a load was pulled), not a code fix, and deciding it silently here would be
-- inventing a financial outcome. That decision stays with the owner.
--
-- DOES close the systemic recurrence gap: no application code path was ever found that sets
-- mdata.loads.soft_deleted_at, meaning the state came from a write outside the app (direct SQL,
-- console, or another tool) — an application-layer guard cannot stop that class of writer. A
-- DATABASE trigger can, regardless of who or what issues the UPDATE (PERMANENT LAW #4: a DB
-- constraint beats a guard — same precedent as ACCT-F158's composite FK). This trigger refuses
-- any UPDATE that sets mdata.loads.soft_deleted_at while an OPEN (unresolved) driver_bills row
-- still references that load, so the exact shape of ACCT-F214 cannot recur for any future load,
-- from any writer.
--
-- Scope of "open": driver_finance.driver_bills.status has exactly 3 live values on prod
-- (open/paid/void, verified live). 'paid' is excluded deliberately — once a bill has been paid,
-- soft-deleting its load does not strand anything (the cash already moved); only 'open' rows
-- represent an unresolved, unstranded-yet payable that a load deletion would orphan.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION is always safe to re-run; the trigger is created only
-- when absent. Replays cleanly on a fresh CI database, a Neon rehearsal branch, or prod re-apply.

BEGIN;

CREATE OR REPLACE FUNCTION mdata.refuse_load_soft_delete_with_open_driver_bill()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  open_bill_count integer;
BEGIN
  -- Only fires on the specific transition this finding is about: soft_deleted_at going from
  -- NULL to non-NULL. A load that is already soft-deleted, or one whose soft_deleted_at is being
  -- cleared (restore), is not this defect's shape and must not be blocked here.
  IF NEW.soft_deleted_at IS NOT NULL AND OLD.soft_deleted_at IS NULL THEN
    SELECT count(*) INTO open_bill_count
      FROM driver_finance.driver_bills db
     WHERE db.load_id = NEW.id
       AND db.status = 'open';

    IF open_bill_count > 0 THEN
      RAISE EXCEPTION
        'ACCT-F5683: refusing to soft-delete load % (%): % open driver_finance.driver_bills row(s) still reference it. Resolve (settle or void) the payable(s) first — voiding/settling a payable is a business decision, never an automatic side effect of deleting its load.',
        NEW.id, NEW.load_number, open_bill_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'mdata' AND c.relname = 'loads'
       AND p.proname = 'refuse_load_soft_delete_with_open_driver_bill' AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_refuse_load_soft_delete_with_open_driver_bill
      BEFORE UPDATE OF soft_deleted_at ON mdata.loads
      FOR EACH ROW
      EXECUTE FUNCTION mdata.refuse_load_soft_delete_with_open_driver_bill();
    RAISE NOTICE 'ACCT-F5683: trg_refuse_load_soft_delete_with_open_driver_bill attached to mdata.loads';
  END IF;
END
$$;

COMMIT;
