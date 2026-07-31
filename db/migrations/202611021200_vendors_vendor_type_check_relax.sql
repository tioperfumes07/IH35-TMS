-- [HOLD-FOR-JORGE — financial] LST-PICKER-01 vendor_type CHECK relax (companion to PR #3884 / guard 1852).
-- POSTS NOTHING. Owner Neon-applies (financial cluster: db/migrations/* touching mdata.vendors); Devin merges.
--
-- *** DO NOT RUN ON PROD. *** Validate on a Neon branch only, then ledger-backfill so prod db:migrate skips it.
--
-- ROOT CAUSE (proven live on Neon PROD br-fancy-credit-akjnd07a 2026-07-31): PR #3884 widened the app-layer
-- Zod schema for `mdata.vendors.vendor_type` from a frozen 8-value z.enum to
-- `z.string().trim().min(1).max(100)` so VendorDetail.tsx can save a vendor type the owner added via the
-- catalogs.vendor_types picker (LST-WIRE-04 / 202607420000, already APPLIED on prod). The DB layer was NOT
-- widened to match: `mdata.vendors` still carries
--   CHECK vendors_vendor_type_check: (vendor_type = ANY (ARRAY['Fuel','Repair','Tires','Towing','Insurance',
--   'Permit','Toll','Other']))
-- confirmed live via pg_get_constraintdef on the same session. Any inline-created catalog vendor type
-- (e.g. "Broker Services") still 400s->500s at the DB CHECK on PATCH/POST — the Zod widening alone is theater
-- without this companion migration (Rule 23 — no money theater).
--
-- SCOPE (DDL only — no data change, no seed, no GL/posting math):
--   Replace the closed 8-value list CHECK with a length/non-blank CHECK matching the Zod bound exactly
--   (trim().min(1).max(100)) so `mdata.vendors.vendor_type` accepts ANY non-blank catalog-sourced value up to
--   100 chars, while still rejecting NULL/blank/oversized garbage at the DB layer (defense-in-depth — the app
--   layer is not the only gate). The existing 8 legacy values (max 9 chars: 'Insurance') trivially satisfy the
--   new CHECK, so no existing row can violate it — confirmed via the live Neon query above (column already
--   NOT NULL text; no row could have been NULL or >100 chars under the tighter FE selects to date).
--
-- NOT IN SCOPE: `mdata.vendors.vendor_type_id` (uuid FK -> catalogs.vendor_types) already exists on prod
-- (202607420000, applied 2026-07-25) and is untouched here. This migration only relaxes the legacy free-text
-- `vendor_type` CHECK so the two columns stay consistent while both are read (ap-aging.service /
-- pse-mirror.service still read the text column per 202607420000's note).
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is safe to re-run — the second run is a clean
-- DROP-then-recreate no-op (same definition). No RAISE, no data dependency, so this is fresh-DB-CI safe:
-- on a fresh 0001 DB, mdata.vendors is empty at this point in the chain so the ALTER never faces an existing
-- violating row regardless of what future seeds insert (they insert catalog-backed values, all >=1 and
-- <=100 chars by construction).
--
-- NO NEW TABLE / NO NEW COLUMN / NO NEW GRANT: pure CHECK constraint replacement on an existing column of an
-- existing table that already has its grants from 0008 (mdata schema) — additive-only per Rule 07.

BEGIN;

ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;
ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check
  CHECK (
    vendor_type IS NOT NULL
    AND length(btrim(vendor_type)) > 0
    AND length(vendor_type) <= 100
  );

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   -- constraint now accepts any non-blank <=100-char value (no rows required):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conname = 'vendors_vendor_type_check' AND conrelid = 'mdata.vendors'::regclass;
--   -- prove a catalog-sourced type outside the legacy 8 now round-trips (use a throwaway/test vendor row,
--   -- never a real one — revert the UPDATE after proving):
--   -- UPDATE mdata.vendors SET vendor_type = 'Broker Services' WHERE id = '<test-vendor-id>';
--
-- ROLLBACK (additive; forward-only chain otherwise):
--   BEGIN;
--     ALTER TABLE mdata.vendors DROP CONSTRAINT IF EXISTS vendors_vendor_type_check;
--     ALTER TABLE mdata.vendors ADD CONSTRAINT vendors_vendor_type_check
--       CHECK (vendor_type = ANY (ARRAY['Fuel','Repair','Tires','Towing','Insurance','Permit','Toll','Other']));
--   COMMIT;
--   -- Only safe if no live row has adopted a non-legacy vendor_type since apply — check first:
--   -- SELECT DISTINCT vendor_type FROM mdata.vendors WHERE vendor_type NOT IN
--   --   ('Fuel','Repair','Tires','Towing','Insurance','Permit','Toll','Other');
