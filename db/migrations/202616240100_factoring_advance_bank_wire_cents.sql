-- 202616240100 — factoring_advance.bank_wire_cents (CC-1 443.346)
--
-- Root cause: postFactoringAdvanceEvent always posts advance_amount_cents to cash_clearing (1090),
-- assuming Faro wires the full net advance to BofA. For some advances Faro wires less (holds the
-- remainder as CCG payment reserve). The gap stays in 1090 permanently and never clears.
--
-- Fix: add bank_wire_cents (nullable) to record the actual BofA wire amount Faro sent. When NULL,
-- the engine falls back to advance_amount_cents (existing behaviour). When set, only bank_wire_cents
-- goes to cash_clearing (1090); the remainder goes to factor_reserve_held (1230).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting'
      AND table_name   = 'factoring_advances'
      AND column_name  = 'bank_wire_cents'
  ) THEN
    ALTER TABLE accounting.factoring_advances
      ADD COLUMN bank_wire_cents bigint NULL;

    COMMENT ON COLUMN accounting.factoring_advances.bank_wire_cents IS
      'Actual BofA wire from Faro (cents). NULL = full advance_amount_cents (default). '
      'When less than advance_amount_cents, the gap is posted to factor_reserve_held (1230) '
      'because Faro held that amount for CCG payments or reserve.';
  END IF;
END $$;
