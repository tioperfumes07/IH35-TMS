-- 202614770000_bills_mdata_vendor_id_fk.sql
-- A-26 (Lead ruling r294d, 2026-09-30): accounting.bills.vendor_uuid is TEXT while mdata.vendors.id
-- is UUID -- every join between them needs an explicit ::text cast today, a real type mismatch on a
-- money join, live-verified across 242 call sites (apps/backend/src, grep for "vendor_uuid").
--
-- ROOT FINDING: accounting.bills already carries a THIRD, correctly-typed column,
-- mdata_vendor_id (uuid), sitting unused alongside the legacy vendor_id/vendor_uuid (both text).
-- Live-verified before writing this migration: 16338 of 16340 rows already have mdata_vendor_id
-- populated, and everywhere it is set it matches vendor_uuid byte-for-byte (0 mismatches); every
-- non-null mdata_vendor_id resolves to a real mdata.vendors row (0 orphans). The data is already
-- correct -- only the FOREIGN KEY enforcement was missing.
--
-- SCOPE, deliberately narrow: this migration adds ONLY the missing FK, nullable (the 2 rows without
-- mdata_vendor_id stay legally NULL, not retroactively failed -- same grandfather pattern as every
-- other NOT VALID/nullable constraint this session). It does NOT touch vendor_id or vendor_uuid, does
-- NOT repoint any of the 242 existing call sites (a call-site migration across accounting.bills.
-- service.ts, fin20-aging, ap-aging, bank-recon/match.service, and ~15 other files is a genuinely
-- separate, larger undertaking with its own review and test surface -- named here, not done here),
-- and touches ZERO data (pure DDL, freeze-compliant under the 2026-09-30 owner freeze on
-- money/accounting/load DATA writes).
--
-- Additive, idempotent, CREATE-only. No existing data touched.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bills_mdata_vendor_id_fkey'
      AND conrelid = 'accounting.bills'::regclass
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_mdata_vendor_id_fkey
      FOREIGN KEY (mdata_vendor_id) REFERENCES mdata.vendors(id);
  END IF;
END $$;

COMMIT;
