-- [HOLD-FOR-JORGE — TIER 1] modsweep-migA2 — make the 2026-07-04 bulk-duplicate insert structurally impossible.
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. *** mdata.* schema change (owner-gated). BUILT-AND-HELD; runs ONLY on
-- a Neon branch by Jorge/GUARD, then ledger-backfilled so prod db:migrate skips it. Adds no data; moves no money.
--
-- WHY: on 2026-07-04 a bulk bad-insert duplicated the ENTIRE fleet — each real unit got a phantom twin with
-- unit_number = 'U-'+original and vin = original+'-U'. mdata.units already has a plain UNIQUE(vin)
-- (units_vin_key), but it did NOT catch these because 'original-U' is a DISTINCT value from 'original' — the
-- exact gap GUARD flagged ("a plain UNIQUE(vin) would not have caught the '-U' suffixed dups"). GUARD has
-- voided the 93 phantoms on prod (deactivated_at set).
--
-- FIX: a valid-VIN CHECK that rejects the synthetic '-U' suffix on ACTIVE units, so the bulk-dup pattern can
-- never be re-inserted as a live unit. Scoped to active rows (deactivated_at IS NULL) so the already-voided
-- phantoms + any legacy rows do not block the constraint. Idempotent. A fuller 17-char VIN-format CHECK is
-- DEFERRED (it needs a data-quality pass on existing legacy VINs first — this targets the proven recurrence).
--
-- ⚠ GUARD NEON PROOF before the owner runs: confirm NO active unit currently has a vin ending in '-U' (all
-- such rows are the voided phantoms) so ADD CONSTRAINT validates cleanly.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mdata.units'::regclass AND conname = 'units_vin_no_synthetic_dup_suffix'
  ) THEN
    ALTER TABLE mdata.units
      ADD CONSTRAINT units_vin_no_synthetic_dup_suffix
      -- an ACTIVE unit's VIN may not carry the '-U' bulk-dup synthetic suffix (voided rows + NULL vin exempt).
      CHECK (deactivated_at IS NOT NULL OR vin IS NULL OR vin !~ '-U$');
  END IF;
END $$;

COMMIT;
