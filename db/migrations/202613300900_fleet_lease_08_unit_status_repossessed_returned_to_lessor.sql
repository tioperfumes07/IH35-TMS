-- TASK 8 / FLEET-LEASE-08 A) -- unit_status has no value for REPOSSESSION or RETURN-TO-LESSOR.
-- Marking a repo 'Sold' books a sale with proceeds that never existed (wrong gain/loss). Marking
-- it 'Transferred' reads as an intercompany move it is not. Live, right now: 2 units repossessed
-- by MITSUBISHI HC CAPITAL AMERICA, 1 by AUXILIOR CAPITAL PARTNERS, 3 more being returned to
-- AUXILIOR this week -- all four still sit InService.
--
-- This migration adds the two enum values plus the metadata columns the disposal each requires,
-- mirroring the SAME shape mdata.units already carries for Sold (sold_date/sold_to/sold_price),
-- Transferred (transferred_date/transferred_to_entity), and Damaged (damage_date/
-- damage_description) -- schema only. The disposal ACCOUNTING (repossession = derecognize asset +
-- relieve debt + gain/loss on the difference; return = lease termination, not a disposal) is a
-- separate, larger posting-engine build tracked as its own remaining item -- this migration only
-- makes it possible to record the TRUE status and the facts (date, lender/lessor, unit) honestly,
-- which is the immediate defect named ("units are misstated right now").

BEGIN;

-- unit_status is a real Postgres ENUM. New values cannot be used in the SAME transaction they are
-- added in (a hard Postgres rule pre-12; even on 12+ this repo's own migrations run one statement
-- block per COMMIT, so keep the ADD VALUE alone and unused here, exactly like every other enum
-- migration in this repo).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'unit_status' AND e.enumlabel = 'Repossessed'
  ) THEN
    ALTER TYPE mdata.unit_status ADD VALUE 'Repossessed';
  END IF;
END
$$;

COMMIT;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'unit_status' AND e.enumlabel = 'ReturnedToLessor'
  ) THEN
    ALTER TYPE mdata.unit_status ADD VALUE 'ReturnedToLessor';
  END IF;
END
$$;

COMMIT;

BEGIN;

ALTER TABLE mdata.units
  ADD COLUMN IF NOT EXISTS repossessed_date date,
  ADD COLUMN IF NOT EXISTS repossessed_by_lender text,
  ADD COLUMN IF NOT EXISTS repossessed_notes text,
  ADD COLUMN IF NOT EXISTS returned_to_lessor_date date,
  ADD COLUMN IF NOT EXISTS returned_to_lessor_entity text,
  ADD COLUMN IF NOT EXISTS returned_to_lessor_notes text;

-- Same "archived -> must be deactivated" rule Sold/Transferred/Damaged already carry
-- (chk_units_archive_status_deactivated): a repossessed or returned-to-lessor unit has left the
-- company's own fleet just as surely as a sold or transferred one has.
DO $$
DECLARE
  con text;
BEGIN
  SELECT conname INTO con
  FROM pg_constraint
  WHERE conrelid = 'mdata.units'::regclass
    AND conname = 'chk_units_archive_status_deactivated';

  IF con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE mdata.units DROP CONSTRAINT %I', con);
  END IF;

  ALTER TABLE mdata.units
    ADD CONSTRAINT chk_units_archive_status_deactivated
    CHECK (
      (status::text <> ALL (ARRAY['Sold', 'Transferred', 'Damaged', 'Repossessed', 'ReturnedToLessor']))
      OR (deactivated_at IS NOT NULL)
    );
END
$$;

COMMIT;
