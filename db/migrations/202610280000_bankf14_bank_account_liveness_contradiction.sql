-- BANK-F14 — a bank account could be `is_active = true` AND deactivated at the same time, and the
-- cash total counted it. Trucking's reported cash was 99.7% Transportation's money.
--
-- OWNER, 2026-07-30 (verbatim): "trucking only has one wf account, those 3 are transprotation. we have
-- the same user id for both companies, so they appear for both we need to deactive 6103, 6129, 6137
-- belong to transportation, 3500 belongs to trucking."
--
-- That is the business fact. This migration makes the data say it, and makes the contradiction that
-- allowed it impossible to recreate.
--
-- ROOT CAUSE — TWO FLAGS FOR ONE IDEA. `banking.bank_accounts` carries BOTH `is_active` and
-- `deactivated_at`, they both mean "is this account live", and nothing kept them in agreement. Queries
-- then picked whichever they liked:
--     account-balance.routes.ts:72   -> deactivated_at IS NULL
--     internal-wallet-balance.ts:169 -> is_active = true          <- the CASH TOTAL
--     banking.routes.ts:557/567      -> deactivated_at IS NULL
-- Both readings are defensible in isolation. With four rows in a contradictory state they disagree,
-- and the one that disagreed was the one that adds up money.
--
-- PROD EVIDENCE (br-fancy-credit-akjnd07a, bypass_rls in its OWN statement, 2026-07-30). Rows counted
-- by the cash total, i.e. account_class='depository' AND is_active=true AND plaid_item_id IS NOT NULL:
--     entity  reported cash   from live rows   from DEACTIVATED rows   deactivated rows counted
--     TRK     $2,009.05       $5.38            $2,003.67               3
--     TRANSP  $4,644.39       $4,718.38        -$73.99                 1
--     USMCA   $92.68          $92.68           -                       0
--   The three deactivated rows inflating TRK are Wells Fargo ••6103 / ••6129 / ••6137 — Transportation's
--   accounts, visible under Trucking because one Plaid login covers both companies. The row understating
--   TRANSP is ••3500 — Trucking's account.
--
--   Whole table: 16 rows — 4 contradictory (is_active AND deactivated), 7 cleanly live, 5 cleanly
--   retired, 0 in the reverse state. The defect set is exactly those 4 rows, which is exactly the set
--   the owner named.
--
-- WHY THIS IS SERIOUS. Cash is the most-read number in the system. Trucking's balance sheet reported
-- $2,009.05 when its own Wells Fargo cash was $5.38, with the difference belonging to another legal
-- entity. On an intercompany schedule, a lender package, or a Ch.11 monthly operating report that is a
-- misstatement of both entities at once — the kind of number a CPA, a lender, or a court reads
-- literally. It is also silent: nothing errored, nothing looked wrong.
--
-- WHAT THIS MIGRATION DOES
--   1. REPAIRS the 4 contradictory rows: where `deactivated_at` is set, `is_active` becomes false.
--      Deactivation is the intent already recorded on the row; this makes the other flag agree. It does
--      not deactivate anything new, does not choose which entity owns an account, and does not move a
--      single transaction. VOID-NOT-DELETE — every row, and all 4,619 transactions hanging off them,
--      stay exactly where they are and stay auditable.
--   2. Adds a CHECK constraint so the contradictory state cannot exist again. This is the real fix: not
--      "remember to write both conditions in every query", but "the invalid state is unrepresentable".
--      A query that checks only one flag is then correct by construction.
--
-- EXPECTED RESULT (arithmetic, verified against the figures above):
--     TRK    $2,009.05 -> $5.38        (only ••3500 remains live — Trucking's own account)
--     TRANSP $4,644.39 -> $4,718.38    (••6103 + ••6129 + ••6137 remain live)
--     USMCA  $92.68    -> $92.68       (unchanged)
--
-- FAIL-CLOSED: re-derives the contradiction count, and refuses to add the constraint if any row still
-- violates it. Guarded so an empty database is a clean no-op rather than an abort.
-- IDEMPOTENT: the UPDATE is guarded; a second run changes 0 rows and the constraint add is IF NOT EXISTS.

DO $$
DECLARE
  v_before int;
  v_repaired int;
  v_after int;
BEGIN
  SELECT count(*) INTO v_before
    FROM banking.bank_accounts
   WHERE is_active = true AND deactivated_at IS NOT NULL;

  UPDATE banking.bank_accounts
     SET is_active = false
   WHERE is_active = true
     AND deactivated_at IS NOT NULL;
  GET DIAGNOSTICS v_repaired = ROW_COUNT;

  SELECT count(*) INTO v_after
    FROM banking.bank_accounts
   WHERE is_active = true AND deactivated_at IS NOT NULL;

  RAISE NOTICE 'BANK-F14: % contradictory row(s) before; % repaired; % remain', v_before, v_repaired, v_after;

  IF v_after <> 0 THEN
    RAISE EXCEPTION 'BANK-F14: % row(s) still active-and-deactivated after repair. Aborting.', v_after;
  END IF;
END $$;

-- The invariant, enforced. A deactivated account is not active — full stop.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_bank_accounts_deactivated_implies_inactive'
       AND conrelid = 'banking.bank_accounts'::regclass
  ) THEN
    ALTER TABLE banking.bank_accounts
      ADD CONSTRAINT ck_bank_accounts_deactivated_implies_inactive
      CHECK (deactivated_at IS NULL OR is_active = false);
  END IF;
END $$;

COMMENT ON CONSTRAINT ck_bank_accounts_deactivated_implies_inactive ON banking.bank_accounts IS
  'BANK-F14 (2026-07-30): a deactivated account may not also be is_active. The table carries two flags for one idea and queries used them interchangeably; four rows disagreed, and the cash total (internal-wallet-balance.ts, is_active only) counted three of Transportation''s Wells Fargo accounts as Trucking cash — $2,003.67 of $2,009.05 reported. Enforced here so a query that checks either flag alone is correct by construction.';
