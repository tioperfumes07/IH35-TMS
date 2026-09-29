-- ROUND 270 follow-up — AUTH-132 corrected the 2 known-bad accounting.factoring_advances rows
-- (status flipped 'advanced' -> 'voided' to match their already-stamped voided_at). Now that live
-- has 0 rows violating the invariant, VALIDATE the NOT VALID constraint added in migration
-- 202614570000 so it is fully enforced (a NOT VALID constraint still blocks new violations, but a
-- validated one also confirms no old row silently slipped past).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'factoring_advances_status_matches_voided_at'
      AND conrelid = 'accounting.factoring_advances'::regclass
      AND NOT convalidated
  ) THEN
    ALTER TABLE accounting.factoring_advances
      VALIDATE CONSTRAINT factoring_advances_status_matches_voided_at;
  END IF;
END $$;
