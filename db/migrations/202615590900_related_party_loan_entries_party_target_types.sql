-- 202615590900_related_party_loan_entries_party_target_types.sql
-- CC-3 · RULING 443.65 #2 (443.59 "Due to / from <party>" engine). The create writer already offers target_type
-- 'party_transfer_out' (443.59 entries a and e: USMCA sends the party money / repays it — Dr Due to / from / Cr bank,
-- #26377), but related_party_loan_entries_target_type_check never listed it, so every such entry is refused at INSERT
-- on prod (measured 2026-10-11 19:45 UTC: CHECK lists 10 types, party_transfer_out not among them; 0 rows carry it).
-- 443.65 adds 'party_paid_vendor' (entries c and d: the party pays a USMCA vendor or expense directly — Dr the account
-- paid (2510 Dreamline Diesel Card Payable, or the expense) / Cr Due to / from, party entity + source document required).
-- Constraint only: every existing row already satisfies the wider list; no rows written. Fail-closed if it ever would not.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE accounting.related_party_loan_entries
  DROP CONSTRAINT IF EXISTS related_party_loan_entries_target_type_check;
ALTER TABLE accounting.related_party_loan_entries
  ADD CONSTRAINT related_party_loan_entries_target_type_check
  CHECK (target_type = ANY (ARRAY[
    'bill'::text, 'settlement'::text, 'cash_advance'::text, 'expense'::text, 'loan_out'::text, 'repayment'::text,
    'intercompany'::text, 'bank_funding'::text, 'bank_repayment'::text, 'paid_direct_vendor'::text,
    'party_transfer_out'::text, 'party_paid_vendor'::text
  ]));

COMMIT;
