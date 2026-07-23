-- 202607750000_guard_holds_driver_vendor_billable_credit_idempotency.sql
--
-- GUARD HOLD BATCH — owner-applied (Jorge), 2026-07-23.
-- Closes 4 of the 5 HOLD items found in the Accounting guard review. The 5th (vendor credits vs
-- bills.paid_cents) is deliberately NOT here — it is a CODE fix, see the note at the bottom.
--
-- Numbering: main's max was 202607730000. NOTE: 202607740000 is already claimed by PR #3250 (held claim-WO-bill FK migration), so this is renumbered to 202607750000 to avoid a filename collision.
-- Safety: additive only. No DROP, no DELETE, no UPDATE of existing rows, no backfill.
--         Every statement is idempotent (IF NOT EXISTS / guarded DO block), so re-running is safe.
-- RLS/grants: adds NO new table and NO new schema, so migration 0065's grants and the existing
--         FORCE-RLS policies continue to apply unchanged. Nothing to re-grant.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. DRIVER <-> VENDOR: a real FK, replacing a memo-only link
-- ---------------------------------------------------------------------------
-- WHY: drivers are paid as vendors (A/P + 1099/W-8BEN). Today a driver-as-vendor row is tied to its
-- driver only by a truncated uuid embedded in vendor_code ('DRV-<NAME>-<8hex>'). That is a
-- memo-only link — the audit law calls it FAIL, and no reverse drill (driver -> their vendor row,
-- vendor -> the driver) is possible.
--
-- NOT mdata.drivers.qbo_vendor_id: that column holds the QUICKBOOKS vendor id and is consumed by
-- the QBO push handlers. Writing a local mdata.vendors uuid there would corrupt QBO mapping.

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES mdata.drivers(id);

COMMENT ON COLUMN mdata.vendors.driver_id IS
  'Canonical driver-as-vendor link. NULL for ordinary vendors. Set when a vendor row exists solely '
  'to pay a driver (A/P aging + 1099/W-8BEN). Enables forward+reverse drill driver <-> vendor. '
  'Distinct from mdata.drivers.qbo_vendor_id, which is the QuickBooks id, not a local uuid.';

CREATE INDEX IF NOT EXISTS idx_vendors_driver_id
  ON mdata.vendors (driver_id)
  WHERE driver_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. ONE ACTIVE VENDOR ROW PER DRIVER PER ENTITY
-- ---------------------------------------------------------------------------
-- WHY: the driver-as-vendor backfill de-duplicates by lower(btrim(vendor_name)) with NO database
-- constraint. Two concurrent runs create duplicate payees (A/P for one driver split across two
-- vendors), and two drivers with the SAME NAME silently collapse onto one vendor — i.e. paying the
-- wrong person. This makes the database enforce it instead of trusting application timing.
-- Partial index: only active driver-vendor rows are constrained, so soft-deleted history is kept
-- (void-not-delete) and ordinary vendors are unaffected.

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_driver_active_per_company
  ON mdata.vendors (operating_company_id, driver_id)
  WHERE driver_id IS NOT NULL AND deactivated_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. BILLABLE-EXPENSE FLAG ON THE CHART OF ACCOUNTS
-- ---------------------------------------------------------------------------
-- WHY: the New Account drawer renders "Use for billable expenses" and there is no column to store
-- it, so the checkbox was silently discarded on every save (fixed in PR #3257 by disabling the
-- control). This is the storage it needs. QBO parity: "Use for billable expenses".
-- DEFAULT false = no behaviour change for the 371 existing accounts.

ALTER TABLE catalogs.accounts
  ADD COLUMN IF NOT EXISTS is_billable_expense boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN catalogs.accounts.is_billable_expense IS
  'QBO parity "Use for billable expenses". Marks an expense account whose costs may be re-billed to '
  'a customer. Display/selection only — this flag NEVER auto-posts anything.';

-- ---------------------------------------------------------------------------
-- 4. VENDOR-CREDIT APPLICATION IDEMPOTENCY
-- ---------------------------------------------------------------------------
-- WHY: accounting.vendor_credit_applications has no idempotency key, so a double-submit (or a retry
-- after a timeout) inserts the application twice and decrements the credit twice.
-- Chosen shape: an explicit key + unique index, NOT a unique (credit_id, bill_id) constraint —
-- because applying one credit to the same bill in two legitimate partial amounts must stay possible.

ALTER TABLE accounting.vendor_credit_applications
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN accounting.vendor_credit_applications.idempotency_key IS
  'Client-supplied key making credit application safe to retry. Unique per entity among non-voided '
  'rows. NULL is allowed so existing rows stay valid; new writes should always send one.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendor_credit_app_idempotency
  ON accounting.vendor_credit_applications (operating_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND voided_at IS NULL;

-- Supports the per-bill credit SUM the A/P aging runs for every open bill.
CREATE INDEX IF NOT EXISTS idx_vendor_credit_app_bill_active
  ON accounting.vendor_credit_applications (bill_id)
  WHERE voided_at IS NULL;

COMMIT;

-- ===========================================================================
-- NOT IN THIS MIGRATION — ON PURPOSE
-- ===========================================================================
-- HOLD-4 "a credit-settled bill still shows payable" is NOT fixed with SQL.
--
-- The two formulas today:
--   A/P aging      = amount_cents - SUM(bill_payments) - SUM(vendor_credit_applications)
--   bills list and
--   pay picker     = amount_cents - paid_cents
--
-- The tempting fix is to fold credits into bills.paid_cents. Do NOT: paid_cents already has four
-- independent writers in the application (bills.service.ts x3, bills-bulk.routes.ts), including a
-- void path that recomputes paid_cents = MAX(0, paid - amount). A migration that redefines the
-- column's meaning would be fighting those writers and would corrupt on the next void.
--
-- Correct fix: change the READ in bills.service.ts so the list and pay picker subtract non-voided
-- vendor credits, exactly as the aging already does. Code change, no schema change, no data rewrite.
--
-- HOLD-5 "a $5,000 credit can be applied to a $100 bill" is also a code fix:
-- vendor-credits.routes.ts already SELECTs bill.amount_cents and bill.paid_cents and then never
-- uses them. The cap belongs in that route (a cross-row SUM cannot be a column CHECK).
