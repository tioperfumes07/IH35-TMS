-- FINDING: LV-CATALOG-VENDOR-TYPES-500-PHANTOM-COLUMN
--
-- GET /api/v1/catalogs/vendors/vendor-types returns 500 {"code":"42703","message":"column
-- t.description does not exist"} — three times on every vendor detail load, live on prod.
--
-- ROOT CAUSE: vendorTypesCatalogConfig (apps/backend/src/catalogs/generic-catalog.routes.ts:593)
-- declares allowedColumns ["code","display_name","description","is_active","sort_order"] and
-- searchableColumns including "description", but catalogs.vendor_types never got that column.
--
-- ★ THE FILE'S OWN COMMENT PREDICTED THIS EXACTLY (generic-catalog.routes.ts ~:190): "vendor_types
-- was deliberately EXCLUDED from this batch: it uses vendor_type_name/vendor_type_code and has no
-- sort_order, so it needs an additive shape migration first rather than a config that would 500 on
-- first use." The config shipped anyway and 500s on first use, exactly as written.
--
-- LIVE EVIDENCE (Neon br-fancy-credit-akjnd07a, bypass_rls=lucia as its own statement) — the shape
-- migration landed 3 of its 4 columns, which is why this looked done:
--   catalogs.vendor_types count 24 · code 24/24 · display_name 24/24 · sort_order 24/24
--   description: COLUMN ABSENT   ·   notes: populated 0/24
--
-- WHY ADD THE COLUMN RATHER THAN DROP IT FROM THE CONFIG: the canonical catalog shape is
-- code/display_name/description/is_active/sort_order, and the three sibling catalogs verified against
-- prod (cash_advance_types, escrow_types, expense_categories) all carry `description`. Dropping it
-- from the config would leave vendor_types permanently non-canonical — the one catalog of 30 where an
-- operator cannot record a description — and would keep the generic catalog UI inconsistent. Finishing
-- the shape migration is the root fix; editing the config to match a half-built table is the patch.
--
-- NOT a duplicate of `notes`: notes is populated on 0 of 24 rows (dead legacy column), so this adds a
-- field, it does not fork a live one. No backfill — inventing descriptions would be invented data.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS). Additive only: no column dropped, no row written, no amount
-- touched, no RLS/grant change (catalogs.vendor_types already has FORCE RLS + entity scoping).

BEGIN;

ALTER TABLE catalogs.vendor_types
  ADD COLUMN IF NOT EXISTS description text;

COMMENT ON COLUMN catalogs.vendor_types.description IS
  'Canonical catalog shape (code/display_name/description/is_active/sort_order). Added by 202612481000 '
  'to complete the partial shape migration that caused GET vendor-types to 500 with 42703.';

COMMIT;
