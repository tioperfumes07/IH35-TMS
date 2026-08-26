BEGIN;

ALTER TABLE safety.training_programs
  ADD COLUMN IF NOT EXISTS recertify_months SMALLINT NULL;

UPDATE safety.training_programs
SET recertify_months = 12
WHERE frequency = 'n_month'
  AND recertify_months IS NULL;

ALTER TABLE safety.training_programs
  DROP CONSTRAINT IF EXISTS training_programs_recertify_months_frequency_check;

ALTER TABLE safety.training_programs
  ADD CONSTRAINT training_programs_recertify_months_frequency_check
  CHECK (
    (frequency = 'n_month' AND recertify_months BETWEEN 1 AND 60)
    OR (frequency <> 'n_month' AND recertify_months IS NULL)
  );

COMMIT;
