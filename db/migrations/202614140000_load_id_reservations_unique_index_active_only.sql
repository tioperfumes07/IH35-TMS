-- P1 2026-09-14 (LOAD-NUMBER-COUNTER-POISONED, follow-up) — Claude Lead's ROUND directive:
-- the load-number counter was corrected so the next mint is the owner's true next number
-- (13596). Proving that live hit a SECOND, independent bug: reserving 13596 for real 409'd
-- with duplicate_load_number, existing_id pointing at a reservation row created 2026-09-04,
-- reserved_load_number='13596', status='expired' -- never consumed into a real load, abandoned
-- 10 days ago, yet still permanently blocking that number from ever being reserved again.
--
-- ROOT CAUSE: dispatch.load_id_reservations carried
-- load_id_reservations_operating_company_id_reserved_load_num_key, a PLAIN (non-partial)
-- UNIQUE INDEX on (operating_company_id, reserved_load_number) with no status filter. Any
-- reservation that was ever created for a number -- reserved, then abandoned, expired,
-- cancelled, or even successfully consumed into a real load -- keeps that row in the index
-- forever, so the SAME number can never be reserved again even after its original claim is
-- long dead. This is a distinct bug from the counter-seed issue (LST-F30171): fixing the
-- counter alone still walks into this wall the moment the corrected next number happens to
-- collide with any number ever reserved-and-abandoned in this table's history, exactly as
-- reproduced live against 13596.
--
-- FIX: replace the non-partial unique index with one scoped to CURRENTLY-ACTIVE reservations
-- only (status = 'reserved') -- the same pattern this migration set already uses elsewhere in
-- this codebase (accounting.invoices' uq_invoices_source_load_active, driver_finance.
-- driver_settlements' uq_driver_settlements_source_document_ref_live). A cancelled, expired, or
-- consumed reservation releases its number; only a currently-reserved row keeps it locked.
--
-- SAFE BY CONSTRUCTION: the new partial index is a strict SUBSET of what the old full index
-- already enforced (uniqueness among 'reserved' rows was always implied by global uniqueness),
-- so it can never fail to build on existing data -- no cleanup, no data mutation, no row
-- touched. Idempotent (IF EXISTS / IF NOT EXISTS). Additive-only in spirit: the real-world
-- reservation semantics this index protects (no two concurrent claims on the same number) are
-- unchanged; only long-dead claims stop being permanent.

BEGIN;

DO $$
BEGIN
  IF to_regclass('dispatch.load_id_reservations') IS NULL THEN
    RAISE NOTICE 'Skipping load_id_reservations active-only unique index: table missing';
    RETURN;
  END IF;

  EXECUTE 'DROP INDEX IF EXISTS dispatch.load_id_reservations_operating_company_id_reserved_load_num_key';

  EXECUTE $idx$
    CREATE UNIQUE INDEX IF NOT EXISTS uq_load_id_reservations_active_number
      ON dispatch.load_id_reservations (operating_company_id, reserved_load_number)
      WHERE status = 'reserved'
  $idx$;
END $$;

COMMIT;
