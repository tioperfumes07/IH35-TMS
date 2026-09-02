-- 202613350001_linkage_integrity_law_reconciliation_matches_widen.sql
-- LINKAGE-INTEGRITY-LAW (board, owner paste 2026-09-01, routed CC-1 FORCE) -- "match must be a
-- record (banking.matches), not a one-sided pointer; DB TRIGGER releases both sides on void OR
-- bank unmatch; ONE void column convention (voided_at+reason+by)."
--
-- LIVE ARCHAEOLOGY BEFORE BUILDING (never invent a new schema when one already half-exists): a real
-- table already satisfies most of this ask -- banking.reconciliation_matches -- with the EXACT void
-- convention requested (voided_at + void_reason + voided_by_user_id, NOT VALID CHECK requiring a
-- reason whenever voided_at is set) and a proper match_state lifecycle (auto_matched/user_matched/
-- rejected). It is written by /api/v1/banking/reconciliation/:sessionId/match+unmatch AND by the
-- separate accounting/bank-recon/match.service.ts accept flow, for payment/bill_payment/transfer/je/
-- expense -- 5 of the 8 ledger_entry_kind values banking.bank_transactions.matched_* actually holds.
--
-- THE GAP: load/bill/settlement (banking.bank_transactions.matched_load_id/matched_bill_id/
-- matched_settlement_id, written by reconciliation.routes.ts's own /match handler) are NOT in this
-- table's kind CHECK at all -- confirmed live via pg_get_constraintdef, 2026-09-01. Those 3 kinds are
-- exactly the "one-sided pointer, not a record" LINKAGE-INTEGRITY-LAW names: no match_state, no
-- matched_by, no void trail when released. This migration is Slice 1 -- widen the CHECK so the app
-- code change (same PR) can start writing proper matches-records for all 8 kinds, reusing the
-- existing table/convention rather than building a parallel banking.matches schema from scratch.
--
-- Additive only -- no data change, no backfill (existing rows for the 5 already-covered kinds are
-- untouched; this only widens what values are ACCEPTED going forward). Idempotent: DROP+re-ADD is
-- safe to re-run.

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
    'settlement'::text
  ]));
