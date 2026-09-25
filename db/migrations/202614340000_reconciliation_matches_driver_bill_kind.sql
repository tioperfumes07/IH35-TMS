-- 202614340000_reconciliation_matches_driver_bill_kind.sql
-- R-153 step 6 (routed by CC-2, cc2-*-prefixed branches barred from db/migrations/ by
-- verify-migration-lane-band.mjs).
--
-- GAP: an already-posted driver-settlement bill_payment is matchable today via the existing
-- 'bill_payment' kind -- no gap there. The gap is matching a bank line directly against an OPEN,
-- unpaid driver_finance.driver_bills row (the settlement hasn't closed yet). CC-2 has the app-side
-- half ready (a driver_bill acceptBillMatch cousin, reusing settlement-bill-payment-posting.
-- service.ts's own writer) and is blocked only on this CHECK.
--
-- SAME SHAPE as 202613350001_linkage_integrity_law_reconciliation_matches_widen.sql, which already
-- widened this exact constraint for load/bill/settlement -- adds exactly one more value,
-- 'driver_bill', nothing else. Targets banking.reconciliation_matches specifically (there is a
-- separate, older bank.reconciliation_matches table with the same name and an unrelated, narrower
-- CHECK -- confirmed live via pg_constraint.conrelid before writing this; NOT touched here).
--
-- Additive only -- no data change, no backfill. Idempotent: DROP+re-ADD is safe to re-run.

ALTER TABLE banking.reconciliation_matches
  DROP CONSTRAINT IF EXISTS reconciliation_matches_ledger_entry_kind_check;

ALTER TABLE banking.reconciliation_matches
  ADD CONSTRAINT reconciliation_matches_ledger_entry_kind_check
  CHECK (ledger_entry_kind = ANY (ARRAY[
    'payment'::text,
    'bill_payment'::text,
    'transfer'::text,
    'je'::text,
    'expense'::text,
    'load'::text,
    'bill'::text,
    'settlement'::text,
    'driver_bill'::text
  ]));
