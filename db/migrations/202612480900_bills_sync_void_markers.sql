-- FINDING: LV-BILL-VOID-MARKERS-ARE-DISJOINT
--
-- accounting.bills carries TWO void marker sets and they disagree:
--   set A: voided_at  / voided_by_user_id  / void_reason
--   set B: revoked_at / revoked_by_user_id / revoked_reason
--
-- LIVE PROOF (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia as its OWN statement — a CTE bypass
-- returns a false zero; n=16,294 bills is the completeness discriminator, not a bare count):
--   voided_at NOT NULL = 4 · revoked_at NOT NULL = 2 · status='void' = 6
--   voided_at-only = 4 · revoked_at-only = 2
--
-- ORIGIN SPLIT — this is why a code-only fix cannot work. The 4 voided_at-only rows were written by
-- the ACCT-F142 dedup MIGRATION (its text is still in void_reason; voided_by_user_id is NULL because
-- a migration has no actor). The 2 revoked_at-only rows were written by the APP void path (actor
-- e4117991-…). Two writer POPULATIONS, two conventions, one table. A KPI filtering `voided_at IS NULL`
-- counts the 2 app-voided bills as open A/P; one filtering `revoked_at IS NULL` counts the 4
-- migration-voided ones. That is the mechanism behind the measured $1,766.66 / 79% A/P overstatement.
--
-- WHY A TRIGGER AND NOT FOUR EDITED CALL SITES (§9.0.17 — one sweep, never per-site): the four app
-- writers (bills.service.ts voidBill + voidBillInClientTx, bills-bulk.routes.ts, governance/
-- void-cancel-executors.ts) could each be patched, but a MIGRATION is one of the two writers, and
-- application code cannot reach the NEXT migration that voids a bill. A BEFORE trigger is the only
-- place that covers app paths, governance paths, bulk paths, and future SQL alike.
--
-- Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS). Void-not-delete preserved: this migration
-- never deletes a row and never un-voids one. NO amounts are touched — not amount_cents, not
-- paid_cents, not total_amount. No rows are created. No TMS->QBO write-back.

BEGIN;

-- Completes whichever marker set the writer left blank, in BOTH directions, so no consumer can
-- disagree with another about whether a bill is void. Deliberately fills FROM whichever side carries
-- a value rather than stamping now()/current_user: a reversing entry and its audit trail must keep
-- the ORIGINAL void moment and actor, not the moment this trigger happened to fire.
CREATE OR REPLACE FUNCTION accounting.sync_bill_void_markers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $fn$
DECLARE
  v_ts     timestamptz;
  v_actor  uuid;
  v_reason text;
BEGIN
  -- Only engage on the void lifecycle. A plain payment/status/updated_at write on a live bill must
  -- pass through untouched.
  IF NEW.status = 'void' OR NEW.voided_at IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
    -- Earliest recorded void moment wins; now() only when neither side recorded one at all.
    v_ts     := LEAST(
                  COALESCE(NEW.voided_at, NEW.revoked_at, now()),
                  COALESCE(NEW.revoked_at, NEW.voided_at, now())
                );
    v_actor  := COALESCE(NEW.voided_by_user_id, NEW.revoked_by_user_id);
    v_reason := COALESCE(NULLIF(NEW.void_reason, ''), NULLIF(NEW.revoked_reason, ''));

    NEW.voided_at          := v_ts;
    NEW.revoked_at         := v_ts;
    NEW.voided_by_user_id  := v_actor;
    NEW.revoked_by_user_id := v_actor;
    NEW.void_reason        := v_reason;
    NEW.revoked_reason     := v_reason;

    -- A row carrying a void timestamp but a live status is the third disagreement, and it is how the
    -- ACCT-F142 rows read before status was corrected by hand. Converge it here instead.
    NEW.status := 'void';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_bills_sync_void_markers ON accounting.bills;
CREATE TRIGGER trg_bills_sync_void_markers
  BEFORE INSERT OR UPDATE ON accounting.bills
  FOR EACH ROW
  EXECUTE FUNCTION accounting.sync_bill_void_markers();

-- Owner-authorized 2026-08-11: reconcile the rows that are ALREADY status='void' so the two marker
-- sets agree on history as well as going forward. Explicitly NOT an economic backfill — it invents no
-- void, no amount and no row. It only copies a timestamp/actor/reason ACROSS from the marker set the
-- writer did populate, on rows whose void is already an established fact. The WHERE clause is
-- status='void' AND one side NULL, so a live bill can never be caught by it.
UPDATE accounting.bills
SET voided_at          = COALESCE(voided_at, revoked_at),
    revoked_at         = COALESCE(revoked_at, voided_at),
    voided_by_user_id  = COALESCE(voided_by_user_id, revoked_by_user_id),
    revoked_by_user_id = COALESCE(revoked_by_user_id, voided_by_user_id),
    void_reason        = COALESCE(NULLIF(void_reason, ''), NULLIF(revoked_reason, '')),
    revoked_reason     = COALESCE(NULLIF(revoked_reason, ''), NULLIF(void_reason, ''))
WHERE status = 'void'
  AND (voided_at IS NULL OR revoked_at IS NULL);

COMMIT;
