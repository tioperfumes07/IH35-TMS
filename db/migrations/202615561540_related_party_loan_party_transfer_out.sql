-- 202615561540_related_party_loan_party_transfer_out.sql
-- ROUND 443.54-7 / 443.59 — widen target_type CHECK for party_transfer_out
-- (USMCA sends money TO a related party: Dr Due to/from / Cr bank).
-- CREATE-only widen; existing rows keep their values. No DROP of data.
-- Cursor lane HH 12–23 (this file HH=15).

BEGIN;

ALTER TABLE accounting.related_party_loan_entries
  DROP CONSTRAINT IF EXISTS related_party_loan_entries_target_type_check;
ALTER TABLE accounting.related_party_loan_entries
  ADD CONSTRAINT related_party_loan_entries_target_type_check
  CHECK (target_type = ANY (ARRAY[
    'bill'::text, 'settlement'::text, 'cash_advance'::text, 'expense'::text,
    'loan_out'::text, 'repayment'::text, 'intercompany'::text,
    'bank_funding'::text, 'bank_repayment'::text,
    'paid_direct_vendor'::text,
    'party_transfer_out'::text
  ]));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'related_party_loan_entries_target_type_check'
      AND conrelid = 'accounting.related_party_loan_entries'::regclass
      AND pg_get_constraintdef(oid) LIKE '%party_transfer_out%'
  ) THEN
    RAISE EXCEPTION '202615561540: target_type CHECK missing party_transfer_out';
  END IF;
END $$;

COMMIT;
