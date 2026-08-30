-- GO-ACCT-01-DUP-RECON-SESSIONS-ONE-PERIOD -- reconciliation_sessions has no cancel/void mechanism
-- (only 'open' / 'reconciled' / 'disputed' / 'finalized' / 'reopened' -- every one of those is either
-- active or a terminal SUCCESS state; none means "this one was a mistake"). Nothing stopped a second
-- (or third) POST /api/v1/banking/reconciliation/start for the same bank_account_id + period from
-- creating a duplicate row -- confirmed live: USMCA FREIGHT (e83028a5-...) August 2026 carries 3 rows
-- for the identical period, one correctly 'reconciled' and two stray 'open' duplicates.
--
-- FIX, void-not-delete (the same pattern every other money-adjacent table in this repo uses):
--   1. Add 'voided' to the status CHECK + voided_at/voided_by_user_id/void_reason columns.
--   2. One-time, GENERAL backfill (not hardcoded ids): for every (bank_account_id, period_start,
--      period_end) group with more than one non-voided row, keep exactly the canonical one
--      (prefer 'reconciled' over any other status; earliest reconciled_at/created_at as tiebreak)
--      and void every other row in that group. A 'reconciled' row is NEVER voided by this rule (that
--      would need a manual reopen-then-void decision, not an automated migration) -- confirmed live
--      today only ONE group anywhere in the table has duplicates (the USMCA FREIGHT group above); this
--      rule is written generally so it also self-heals any future group that slips through before the
--      new unique index below lands.
--   3. A UNIQUE partial index enforces "at most one non-voided session per account+period" going
--      forward -- the actual DB-level guarantee the route-level check (reconciliation.routes.ts) is
--      now backed by.
--
-- The application-level fix (a check in POST /start before insert + a new POST /:sessionId/void route)
-- ships in the same PR as this migration; this file is schema + one-time backfill only.

BEGIN;

DO $$
DECLARE
  status_constraint text;
BEGIN
  IF to_regclass('banking.reconciliation_sessions') IS NULL THEN
    RAISE NOTICE 'GO-ACCT-01: reconciliation_sessions absent -- skipping';
    RETURN;
  END IF;

  -- 1a. Void-not-delete columns.
  ALTER TABLE banking.reconciliation_sessions
    ADD COLUMN IF NOT EXISTS voided_at timestamptz,
    ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity.users(id),
    ADD COLUMN IF NOT EXISTS void_reason text;

  -- 1b. Widen the status CHECK (drop-by-discovered-name + re-add, matching 0184's own pattern --
  -- never assume the constraint name, another migration may have already renamed it).
  SELECT c.conname
  INTO status_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'banking'
    AND t.relname = 'reconciliation_sessions'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%status%';

  IF status_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE banking.reconciliation_sessions DROP CONSTRAINT %I', status_constraint);
  END IF;

  ALTER TABLE banking.reconciliation_sessions
    ADD CONSTRAINT reconciliation_sessions_status_check
    CHECK (status IN ('open', 'reconciled', 'disputed', 'finalized', 'reopened', 'voided'));

  -- 2. General duplicate backfill -- keep the canonical row per (account, period), void the rest.
  -- Never touches a row that is the sole occupant of its group (rn=1 always survives), and never
  -- voids a 'reconciled' row even if a group somehow has more than one (left for manual review).
  WITH ranked AS (
    SELECT
      id,
      status,
      ROW_NUMBER() OVER (
        PARTITION BY bank_account_id, period_start, period_end
        ORDER BY (status = 'reconciled') DESC, reconciled_at ASC NULLS LAST, created_at ASC
      ) AS rn
    FROM banking.reconciliation_sessions
    WHERE status <> 'voided'
  )
  UPDATE banking.reconciliation_sessions rs
  SET status = 'voided',
      voided_at = now(),
      voided_by_user_id = NULL,
      void_reason = 'GO-ACCT-01 migration backfill: duplicate reconciliation session for the same bank account + period, superseded by the canonical (reconciled, else earliest-created) session for that account + period.'
  FROM ranked r
  WHERE rs.id = r.id
    AND r.rn > 1
    AND rs.status <> 'reconciled';

  -- 3. Enforce it going forward: at most one non-voided session per account + period.
  CREATE UNIQUE INDEX IF NOT EXISTS ux_reconciliation_sessions_one_per_account_period
    ON banking.reconciliation_sessions (bank_account_id, period_start, period_end)
    WHERE status <> 'voided';
END
$$;

COMMIT;
