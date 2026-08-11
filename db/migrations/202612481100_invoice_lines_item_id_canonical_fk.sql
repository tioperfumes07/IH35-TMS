-- FINDING: ACCT-F329 — an invoice line cannot reference the item catalog on a TMS-native entity
--
-- accounting.invoice_lines links to catalogs.items through ONE column: `qbo_item_id` — a free-text
-- QuickBooks id (text, max 120 in the route schema), not a foreign key.
--
-- OWNER RULING 2026-08-11: "USMCA DOES NOT HAVE A QUICKBOOKS ACCOUNT, IT IS ENTIRELY OUR TMS ERP."
-- Verified on the prod branch br-fancy-credit-akjnd07a (bypass_rls='lucia' as its own statement):
--   integrations.qbo_connections  4 total  ·  USMCA 0
--   catalogs.items                USMCA 8 rows  ·  0 with qbo_item_id
--   accounting.invoice_lines      USMCA 33 rows ·  0 with qbo_item_id
--
-- So on the GO-LIVE entity a catalog item selected on an invoice line has NOWHERE to be stored, and
-- the line can never be resolved back to the item. The item catalog and the invoice lines both exist
-- and cannot be joined at all. That is a structural linkage break (CLS-LINKAGE-ONEWAY), not cosmetics.
--
-- NOT A MONEY DEFECT TODAY, and this migration does not pretend otherwise: all 33 USMCA invoice lines
-- carry account_id (33/33) and revenue_code (33/33), so GL posting is fully bound and correct. What is
-- missing is the ITEM identity — which drives item-level revenue reporting, the QBO-parity item column,
-- and any future item-based pricing.
--
-- WHY A REAL FK AND NOT A PATCH: the patch options were (a) match items by name/description, which
-- silently mis-links the moment two items share a name, and (b) synthesise a fake qbo_item_id for
-- TMS-native items, which pollutes a QuickBooks identifier with data QuickBooks never issued and would
-- corrupt the TRANSP/TRK mirror the day those entities sync. Neither fixes the cause: there is no
-- canonical column. This adds one.
--
-- ADDITIVE ONLY (Rule 07 never-delete-only-add): qbo_item_id is KEPT and untouched — it remains the
-- correct linkage for the entities that DO have a QuickBooks realm. item_id becomes the canonical
-- TMS-native link; the two coexist by design, exactly like the retire→canonical pairs elsewhere.
--
-- NO BACKFILL — deliberate. USMCA has nothing to backfill FROM (0 qbo_item_id on both sides), and
-- backfilling TRANSP/TRK from qbo_item_id would be a money-adjacent data migration on entities that
-- USMCA-WIRE-LAW puts out of scope for this lane. Forward-only: a line written from today carries its
-- item; historical lines keep an honest NULL rather than an inferred link.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS). Nullable: an invoice line is not
-- required to reference a catalog item (line_type covers linehaul/fuel-surcharge/etc. which are not
-- catalog items), so NOT NULL would break every existing writer and every non-item line.
-- No RLS/grant change: accounting.invoice_lines already carries operating_company_id + FORCED RLS.

BEGIN;

ALTER TABLE accounting.invoice_lines
  ADD COLUMN IF NOT EXISTS item_id uuid REFERENCES catalogs.items(id);

COMMENT ON COLUMN accounting.invoice_lines.item_id IS
  'Canonical TMS-native link to catalogs.items. Added by 202612481100 (ACCT-F329): qbo_item_id is a '
  'QuickBooks id and can never resolve for an entity with no QuickBooks realm (USMCA). Both columns '
  'coexist — qbo_item_id stays authoritative for QBO-mirrored entities.';

-- Supports the reverse hop (item -> its invoice lines), entity-scoped so it matches the RLS predicate.
CREATE INDEX IF NOT EXISTS ix_invoice_lines_item_id
  ON accounting.invoice_lines (operating_company_id, item_id)
  WHERE item_id IS NOT NULL;

COMMIT;
