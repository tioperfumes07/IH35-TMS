-- [HOLD-FOR-JORGE — TIER 1] VENDOR-QBO-PARITY — additive mdata.vendors columns closing the vendor-side
-- QuickBooks field-parity gap: no payment terms, no default expense account, no website/print-on-check
-- name (companion migration 202607110240 covers mdata.customers; split into two files — one ALTER TABLE
-- per file — so the static schema-parity parser's fixed scan window can't bleed columns between tables).
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Pure ADD COLUMN — no data touched, no existing column altered. ***
--
-- default_expense_account_id is Option-B RECOMMENDATION ONLY (memory
-- `vendor-customer-categorization-option-b`): pre-fills the expense account when creating a bill for
-- this vendor; the user always sees and can override it — never a silent auto-post, no new GL math.
--
-- (eligible_1099 / mc_number / dot_number / address_line2/city/state/postal_code/country already exist
-- on mdata.vendors from 0008/0178/0382 — this migration does NOT touch them, it only surfaces them in
-- the API via a separate non-migration code change.)
BEGIN;

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS print_on_check_name text,
  ADD COLUMN IF NOT EXISTS payment_terms_id uuid REFERENCES catalogs.payment_terms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_expense_account_id uuid REFERENCES catalogs.accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN mdata.vendors.website IS 'QBO parity: vendor website URL.';
COMMENT ON COLUMN mdata.vendors.print_on_check_name IS 'QBO parity: name to print on checks/remittances when it differs from vendor_name (e.g. legal payee name).';
COMMENT ON COLUMN mdata.vendors.payment_terms_id IS 'QBO parity: default payment terms for this vendor (FK catalogs.payment_terms). Pre-fills new bills; per-bill override always possible.';
COMMENT ON COLUMN mdata.vendors.default_expense_account_id IS 'Option-B RECOMMENDATION ONLY (never a silent auto-post): pre-fills the expense account on a new bill line for this vendor. The user always sees and can override the pre-filled value before saving. FK catalogs.accounts, ON DELETE SET NULL so a retired account never blocks vendor edits.';

CREATE INDEX IF NOT EXISTS idx_vendors_payment_terms_id
  ON mdata.vendors (payment_terms_id)
  WHERE payment_terms_id IS NOT NULL AND deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_default_expense_account_id
  ON mdata.vendors (default_expense_account_id)
  WHERE default_expense_account_id IS NOT NULL AND deactivated_at IS NULL;

-- No RLS/grant changes: mdata.vendors already carries FORCE ROW LEVEL SECURITY + GRANT SELECT/INSERT/
-- UPDATE TO ih35_app from 0008 — new columns inherit that automatically.
COMMIT;
