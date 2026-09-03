-- 202613550001_bank_categorization_who_column.sql
-- BANK-CATEGORIZATION-WHO-SPEC-2026-09-03 (owner FINISH LAW 2026-09-03, CC-3 handoff via
-- docs/specs/BANK-CATEGORIZATION-WHO-SPEC-2026-09-03.md) -- closes the "record who" half of the
-- owner's bank-categorization assignment. The "when" half (categorized_at) already works; this
-- table has no column at all for WHICH user categorized a transaction, live-verified on prod
-- (information_schema.columns for banking.bank_transactions has categorized_at, no
-- categorized_by_user_id anywhere in its ~90 columns).
--
-- All 3 live categorize write paths (categorization.routes.ts single-tx + categorize-bulk,
-- plaid.service.ts autoCategorize) already have the actor's uuid in scope at the moment they
-- write categorized_at -- it just has nowhere to go. CC-3 wires the 3 UPDATEs to this column in a
-- follow-up PR once it exists live (not this migration -- migration authorship is CC-1's lane).
--
-- Additive, idempotent, no backfill (nothing to backfill from -- the actor was never recorded
-- anywhere else for existing rows; that is EXPECTED STATE per the spec's own linkage note).

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorized_by_user_id uuid NULL
    REFERENCES identity.users(id);

COMMENT ON COLUMN banking.bank_transactions.categorized_by_user_id IS
  'User who categorized this transaction (set alongside categorized_at). Nullable: rows
   categorized before this column existed, and rows categorized by the rule-matching engine
   with no human actor (autoCategorize dry_run=false calls from apply-historical), never have
   one -- that is EXPECTED STATE, not a defect, same class as QBO-import rows never having a
   TMS-native actor.';
