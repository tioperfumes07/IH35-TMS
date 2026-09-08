-- Migration: 202614000000_mdata_locations_is_sample_data
-- ACC-15 (OWNER-DEFECT-REGISTER 09-03): "is_sample_data set by create paths." Live-confirmed
-- 2026-09-08: mdata.locations has NO is_sample_data column at all, unlike its sibling reference
-- tables (mdata.drivers, mdata.vendors, mdata.units, catalogs.accounts), which already carry it.
--
-- Additive, idempotent, fresh-DB safe. Defaults false so all 31 existing rows stay real -- they
-- were created through the same production booking/dispatch flows as everything else; there is
-- no test-fixture cohort among them to backfill true.

BEGIN;

ALTER TABLE mdata.locations
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

COMMIT;
