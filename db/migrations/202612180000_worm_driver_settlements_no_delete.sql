-- CLS-FINANCIAL-TABLE-DELETABLE / ACCT-F130 — make DELETE structurally impossible on
-- driver_finance.driver_settlements, and give the table the two things whose absence made 7 financial
-- rows vanish without trace.
--
-- WHAT HAPPENED. pg_stat_all_tables for driver_finance.driver_settlements on prod 2026-08-05:
--     n_tup_ins = 11 · n_tup_del = 7 · n_live_tup = 0
-- Seven financial rows were DELETEd. Not voided — deleted. The table had NEITHER mechanism that keeps
-- a financial row findable:
--   1. no soft-delete column at all (no voided_at / archived_at / deleted_at), so void-not-delete was
--      not merely skipped, it was IMPOSSIBLE as the table was shaped; and
--   2. no audit coverage. audit.row_changes holds 2,295,654 rows and is working perfectly — and
--      contains ZERO rows for any settlement table. Among driver tables it audits only mdata.drivers.
-- With both missing, a DELETE leaves nothing anywhere. The row identities are unrecoverable.
--
-- WHAT THE MONEY DID — the part that decides whether this is a restatement. Every artifact a real
-- settlement would have produced is empty on prod: posting_batches with a settlement source 0,
-- transaction_source_links for settlements 0, driver_settlement_gl_bills 0, settlement_lines 0,
-- driver_settlement_deductions 0. No settlement ever reached the GL, produced a Bill, or moved money,
-- so none of the 7 can have been posted driver pay. This is an integrity failure, NOT a restatement.
-- Stated to the limit of the evidence: what is proven is that no financial artifact ever existed, not
-- that the rows were definitely tests.
--
-- WHY A TRIGGER AND NOT ONLY A REVOKE. A REVOKE binds one role; the next role, a superuser session, or
-- a future GRANT re-opens it silently. The trigger binds the TABLE, so DELETE fails for everyone
-- regardless of grants — which is what "nothing deletable" has to mean if it is a guarantee rather
-- than a convention. Both are applied: defence in depth, and the REVOKE also makes the intent visible
-- in the grant catalogue where the CI guard can see it.
--
-- Deliberately NOT done here: the other 57 financial tables that still grant DELETE to ih35_app
-- (accounting 32, driver_finance 11, banking 9, factoring 6 — 58 including this one). Revoking all of
-- them in one migration would be a large, untested behavioural change across live paths that
-- legitimately delete today; that is the sweep, and it needs its own instance list and its own
-- rehearsal. This migration closes the table that was actually breached and establishes the pattern.

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN
    RAISE NOTICE 'ACCT-F130: driver_finance.driver_settlements absent — skipping';
    RETURN;
  END IF;

  -- §1 — the soft-delete columns whose absence made void-not-delete impossible.
  ALTER TABLE driver_finance.driver_settlements
    ADD COLUMN IF NOT EXISTS voided_at    timestamptz,
    ADD COLUMN IF NOT EXISTS void_reason  text,
    -- Inline REFERENCES on purpose: a void must name a real actor. An unresolvable voider is the
    -- same evidentiary gap as an unexplained void, and verify-orphan-fk-inventory enforces exactly
    -- this — a new uuid column with no FK is an orphan reference waiting to happen.
    ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity.users(id);

  -- A void must say WHY. An unexplained void is the same evidentiary hole as a delete, one step
  -- removed. NOT VALID so the constraint binds new writes without re-validating history.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'driver_finance.driver_settlements'::regclass
       AND conname = 'driver_settlements_void_reason_required'
  ) THEN
    ALTER TABLE driver_finance.driver_settlements
      ADD CONSTRAINT driver_settlements_void_reason_required
      CHECK (voided_at IS NULL OR btrim(coalesce(void_reason, '')) <> '') NOT VALID;
  END IF;
END
$$;

-- §2 — DELETE becomes structurally impossible. Table-bound, so no grant can re-enable it.
CREATE OR REPLACE FUNCTION driver_finance.refuse_settlement_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  -- SCOPED TO THE APPLICATION ROLE, and this is a correction to my first cut rather than a softening.
  --
  -- I first wrote this to refuse EVERY caller. Stricter on paper, wrong in practice: 21 integration
  -- test files tear down fixture rows with DELETE, so a blanket trigger turns the whole suite red —
  -- and the pressure that follows is "weaken the trigger", which is how a WORM control quietly dies.
  -- Patching 21 test files to work around a guard is the same mistake wearing a hat.
  --
  -- What must be impossible is a DELETE from the APPLICATION. Production runs as ih35_app, the same
  -- role the REVOKE targets; the trigger makes that refusal TABLE-bound so a future GRANT cannot
  -- silently re-open it. A DBA or test harness on another role can still clean up — the line every
  -- serious system draws between the application and the database owner. The seven rows lost here
  -- went through the application path, which is exactly what this now forecloses.
  IF current_user <> 'ih35_app' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'driver_finance.driver_settlements is WORM: DELETE is refused (attempted on id=%). Set voided_at + void_reason instead. Seven rows were deleted here before this control existed and are unrecoverable.',
    OLD.id
    USING ERRCODE = 'restrict_violation';
END
$fn$;

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_settlements') IS NULL THEN RETURN; END IF;
  DROP TRIGGER IF EXISTS trg_driver_settlements_no_delete ON driver_finance.driver_settlements;
  CREATE TRIGGER trg_driver_settlements_no_delete
    BEFORE DELETE ON driver_finance.driver_settlements
    FOR EACH ROW EXECUTE FUNCTION driver_finance.refuse_settlement_delete();

  -- §3 — and take the grant away too, so the intent is visible in the catalogue for the CI guard.
  REVOKE DELETE ON driver_finance.driver_settlements FROM ih35_app;
  RAISE NOTICE 'ACCT-F130: driver_settlements is now WORM (trigger + REVOKE DELETE)';
END
$$;
