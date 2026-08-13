-- [APPLIED ON PROD 2026-08-13 — LST-F5009] DO NOT RUN ON PROD — runs on a Neon branch /
-- already ledger-backfilled; registered in applied_held[] so prod db:migrate never re-fires.
-- (Marker retained for verify-hold-migrations-registered parity with every other applied_held file.)
--
-- LST-PICKER-01 / LST-F5009 vendor_type CHECK relax (companion to PR #3884 / guard 1852;
-- board LST-VENDOR-TYPE-CREATE-RW-MISMATCH). OWNER LAW 2026-08-03 — Cursor Neon-applied
-- (prepare_database_migration → complete) on br-fancy-credit-akjnd07a; dual-ledger stamped.
--
-- ROOT CAUSE: PR #3884 widened app Zod for mdata.vendors.vendor_type so VendorDetail can save a
-- catalogs.vendor_types value. Prod CHECK vendors_vendor_type_check still enforced the closed 8-value
-- ARRAY — catalog types outside that list 500'd (PG 23514). LV-TXN-017 temporarily narrowed the API
-- to match the live CHECK; this migration is the permanent DB half of R=W.
--
-- SCOPE (DDL only — no data change, no seed, no GL/posting math):
--   Replace the closed 8-value list CHECK with a length/non-blank CHECK matching Zod
--   (trim().min(1).max(100)). Existing legacy values satisfy the new CHECK.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT.
-- NO NEW TABLE / NO NEW COLUMN / NO NEW GRANT.

BEGIN;

ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;
ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check
  CHECK (
    vendor_type IS NOT NULL
    AND length(btrim(vendor_type)) > 0
    AND length(vendor_type) <= 100
  );

COMMIT;

-- POST-APPLY (prod 2026-08-13): pg_get_constraintdef shows length/btrim CHECK (not ARRAY).
-- Temp-branch proof: UPDATE … SET vendor_type = 'Broker Services' returned ok inside ROLLBACK.
