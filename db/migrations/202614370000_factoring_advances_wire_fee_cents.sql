-- 202614370000_factoring_advances_wire_fee_cents.sql
-- Lead ruling, live blocking finding (2026-09-25): accounting.factoring_advances' own stored
-- figures (advance_amount_cents, reserve_amount_cents, factor_fee_cents) are supposed to sum back
-- to invoice_total_cents (verify-ldt-4-factoring-money's own reconciliation check). That held only
-- because every advance funded so far either had NO wire/ACH fee, or (pre-ROUND-86) bundled it
-- silently into factor_fee_cents. ROUND 86 correctly split the wire fee out into its own GL leg
-- (6300 Bank Service Charges & Wire Fees, via ach_cents on the funding poster), but never gave the
-- funding poster's own "correct the stored figures" step anywhere to RECORD that component on the
-- row itself -- so advance + reserve + factor_fee no longer sums to invoice_total for any advance
-- with a real wire fee. Confirmed live blocking every push: FAC-2026-00001
-- 241500 + 3090 + 4410 = 249000 != invoice 250000, gap = exactly the $10.00 wire fee, on all 21 of
-- R-159's advances (each carries the identical $10.00 gap).
--
-- Additive, nullable, no data change (this migration is schema-only; the 21-row backfill is a
-- separate, AUTH-gated data write). NULL means "not captured" -- the same convention this session's
-- own 202614301200_faro_invoice_line_deductions.sql migration uses for the same reason.

ALTER TABLE accounting.factoring_advances ADD COLUMN IF NOT EXISTS wire_fee_cents bigint;

COMMENT ON COLUMN accounting.factoring_advances.wire_fee_cents IS
  'The ACH/wire fee component (ach_cents at funding time), recorded by the funding poster''s own '
  'stored-figures correction alongside advance_amount_cents/reserve_amount_cents/factor_fee_cents so '
  'advance + reserve + factor_fee + wire = invoice_total holds for every advance, not just ones '
  'funded with wire_fee=0. NULL = not captured (funded before this column existed, or no wire fee).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factoring_advances_wire_fee_cents_nonneg'
                   AND conrelid = 'accounting.factoring_advances'::regclass) THEN
    ALTER TABLE accounting.factoring_advances
      ADD CONSTRAINT factoring_advances_wire_fee_cents_nonneg
      CHECK (wire_fee_cents IS NULL OR wire_fee_cents >= 0) NOT VALID;
  END IF;
END
$$;
