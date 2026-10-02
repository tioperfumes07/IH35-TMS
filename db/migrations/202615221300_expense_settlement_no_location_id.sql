-- CLAIM 202615221300 — B-4 check creator: Settlement No + Location on accounting.expenses.
--
-- ORDERS-2026-10-01-BANKING-REGISTER-SET §B-4 / QBO Write Check header fields.
-- Class already lands on expenses.class_id (202613380001). Settlement No + Location need
-- columns before WriteCheckForm can persist them through createCheck().
--
-- LIVE (Neon tiny-field-89581227 / br-fancy-credit-akjnd07a, 2026-10-02T12:xxZ, bypass_rls=lucia):
--   accounting.expenses has class_id; settlement_no and location_id ABSENT (cols_present=0).
--   mdata.locations exists with id PK (fuel stops + yards).
--
-- Additive · idempotent · CREATE-only · no DROP · no money invented · no QBO write-back.
-- Cursor HH 12–23 · LANE_CROSS=2026-10-02-LEAD-RULING-CURSOR-CLAIM-202615221300-LANE-CROSS.md

BEGIN;

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS settlement_no text NULL;

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS location_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('mdata.locations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'expenses_location_id_fkey'
        AND conrelid = 'accounting.expenses'::regclass
    ) THEN
      ALTER TABLE accounting.expenses
        ADD CONSTRAINT expenses_location_id_fkey
        FOREIGN KEY (location_id) REFERENCES mdata.locations(id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN accounting.expenses.settlement_no IS
  'Optional AlwaysTrack / settlement document number on a check or expense header (B-4 QBO Settlement No). Free text; never a fabricated S-YYYY-NNNN surrogate.';

COMMENT ON COLUMN accounting.expenses.location_id IS
  'Optional QBO Location reporting dimension (mdata.locations). Nullable. B-4 Write Check header Location.';

COMMIT;
