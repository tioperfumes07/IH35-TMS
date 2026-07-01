-- [HOLD-FOR-JORGE — PROTECTED] mdata.drivers.hire_date_source — provenance for hire dates
-- ALTER on an EXISTING table => trips the PROTECTED gate (needs the JORGE-APPROVED label). NEVER self-merge.
-- Runs on a Neon branch under GUARD/Jorge before prod.
--
-- WHY: hire dates will be backfilled from multiple sources (Master Contacts List = HR truth; Samsara
-- createdAtTime = estimate, median ~1 day off but floored at Samsara adoption; rehires diverge). Without a
-- provenance flag, an estimated date is indistinguishable from a confirmed HR/I-9 date — a year later no
-- one (owner, CPA, auditor) can tell which is which. McLeod/NetSuite never store an estimate that looks
-- identical to a confirmed value. This column makes every hire_date auditable.
--
-- Values:
--   confirmed       — verified against HR / I-9 (legally material).
--   file_import     — from the owner's Driver Master Contacts List "Hire Date" column.
--   samsara_estimate— derived from Samsara createdAtTime (first login); an ESTIMATE.
--   needs_review    — file vs Samsara diverge >180d (likely rehire) — human decision pending.
--   NULL            — unknown / legacy.
-- Idempotent, forward-only.

BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS hire_date_source text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'drivers_hire_date_source_check'
      AND conrelid = 'mdata.drivers'::regclass
  ) THEN
    ALTER TABLE mdata.drivers
      ADD CONSTRAINT drivers_hire_date_source_check
      CHECK (hire_date_source IS NULL
             OR hire_date_source IN ('confirmed','file_import','samsara_estimate','needs_review'));
  END IF;
END$$;

COMMENT ON COLUMN mdata.drivers.hire_date_source IS
  'Provenance of hire_date: confirmed (HR/I-9) | file_import (Master Contacts List) | samsara_estimate (createdAtTime) | needs_review (divergent/rehire) | NULL (unknown/legacy).';

COMMIT;
