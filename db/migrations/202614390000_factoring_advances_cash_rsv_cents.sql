-- 202614390000_factoring_advances_cash_rsv_cents.sql
-- R-187 G4 (Claude-Lead's own R-159 finding, this session): the same "stored figures don't sum to
-- invoice_total" gap wire_fee_cents (202614370000) closed for the ACH/wire component recurs for
-- Faro's "Cash Rsv" export column. faro-csv-import.ts already parses it into its own field
-- (cash_rsv_amount_cents) per an explicit owner ruling ("Cash Rsv is its own reserve pool, owner
-- ruling: GL 1235, never aliased to reserve" -- faro-csv-import.ts:62, and
-- 202614301200_faro_invoice_line_deductions.sql's own column comment) -- but that value only ever
-- lands on factor.faro_invoice_lines (a line-item detail table). Neither accounting.factoring_advances
-- nor the funding poster's fundingExpectedLegs has anywhere to record it or a JE leg to post it, so
-- on every advance where Faro's statement shows a real Cash Rsv, the amount is currently absorbed
-- silently into the cash_clearing debit -- the SAME class of gap wire_fee_cents fixed for ACH/wire,
-- confirmed live: 8/10, 8/12, 8/13, 8/14/26's advances have reserve_amount_cents wrongly inflated by
-- exactly their Cash Rsv amount (e.g. FAC-2026-00001: reserve_amount_cents 3090 = 0 real Escrow Rsv +
-- 30.90 Cash Rsv that does not belong there).
--
-- Additive, nullable, no data change (schema-only; the affected-advance backfill + the new GL 1235
-- account + role binding + poster leg are separate, AUTH-gated changes). NULL = not captured, same
-- convention as wire_fee_cents and 202614301200's own columns.

ALTER TABLE accounting.factoring_advances ADD COLUMN IF NOT EXISTS cash_rsv_cents bigint;

COMMENT ON COLUMN accounting.factoring_advances.cash_rsv_cents IS
  'Faro export "Cash Rsv": its own reserve pool per owner ruling (GL 1235), never the escrow reserve '
  '(reserve_amount_cents/GL 1230). Recorded here so reserve_amount_cents can be corrected to hold '
  'ONLY the true Escrow Rsv amount, mirroring wire_fee_cents''s own correction for the ACH/wire '
  'component. NULL = not captured (funded before this column existed, or no Cash Rsv on this advance).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factoring_advances_cash_rsv_cents_nonneg'
                   AND conrelid = 'accounting.factoring_advances'::regclass) THEN
    ALTER TABLE accounting.factoring_advances
      ADD CONSTRAINT factoring_advances_cash_rsv_cents_nonneg
      CHECK (cash_rsv_cents IS NULL OR cash_rsv_cents >= 0) NOT VALID;
  END IF;
END
$$;
