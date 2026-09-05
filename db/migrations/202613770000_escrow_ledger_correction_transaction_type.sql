BEGIN;

-- ACCT-ESCROW-BALANCES-STALE-VS-GO19 (owner ruling 2026-09-05: GL is canonical, driver_finance.
-- escrow_balances/escrow_ledger become a reconciled PROJECTION of it, never an independent authority).
-- driver_finance.escrow_ledger.transaction_type only permits 'hold'/'release'/'forfeit' -- none of
-- which honestly describe what the same-PR GO-19-02 catch-up correction is: no cash actually moved
-- (a 'release' would falsely record a payout to the driver; a 'forfeit' would falsely record a
-- recovery). Widening the CHECK to also permit 'correction' lets that one-time catch-up leave a real,
-- honest, non-deletable audit-trail row instead of a silent UPDATE with no ledger entry at all --
-- matches this table's own append-only design intent (void-not-delete law).
--
-- Idempotent: skips if 'correction' is already a permitted value.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'driver_finance.escrow_ledger'::regclass
      AND conname = 'escrow_ledger_transaction_type_check'
      AND pg_get_constraintdef(oid) ILIKE '%correction%'
  ) THEN
    ALTER TABLE driver_finance.escrow_ledger DROP CONSTRAINT escrow_ledger_transaction_type_check;
    ALTER TABLE driver_finance.escrow_ledger
      ADD CONSTRAINT escrow_ledger_transaction_type_check
      CHECK (transaction_type::text = ANY (ARRAY['hold', 'release', 'forfeit', 'correction']::text[]));
  END IF;
END
$$;

COMMENT ON CONSTRAINT escrow_ledger_transaction_type_check ON driver_finance.escrow_ledger IS
  'ACCT-ESCROW-BALANCES-STALE-VS-GO19 (2026-09-05): added ''correction'' alongside the original hold/release/forfeit set -- a real, honest ledger entry type for a data-correction catch-up (e.g. resyncing this table to the GL-canonical accounting.escrow_accounts balance after an out-of-band GL correction) that is neither a release nor a forfeit.';

COMMIT;
