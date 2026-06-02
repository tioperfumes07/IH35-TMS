-- Block 13: Driver Profile Part 1 — endorsements, identity columns (license/medical/drug use existing + safety tables)
BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS employment_status text
    CHECK (employment_status IN ('w2', '1099', 'probationary', 'terminated') OR employment_status IS NULL),
  ADD COLUMN IF NOT EXISTS employee_id_display text,
  ADD COLUMN IF NOT EXISTS cdl_restrictions text,
  ADD COLUMN IF NOT EXISTS endorsement_h boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS endorsement_n boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS endorsement_p boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS endorsement_s boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS endorsement_t boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS endorsement_x boolean NOT NULL DEFAULT false;

COMMIT;
