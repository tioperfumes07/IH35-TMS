-- [HOLD-FOR-JORGE — TIER 1] banking-b4 — driver-keyed default-account mapping (mdata.drivers).
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Pure ADD COLUMN — no data touched, no existing column altered. ***
--
-- WHY: vendors already have a default-account mapping (mdata.vendors.default_expense_account_id,
-- held migration 202607110230 vendor_qbo_parity) that pre-fills the expense account on a new bill.
-- Drivers have NO equivalent: when a bank transaction is categorized to a Driver (BLOCK-6
-- categorization_driver_id, held 202607010010) or a driver-related bill/expense is entered, the
-- account must be picked from scratch every time — inconsistent categorization across sessions is
-- exactly the drift the twice-daily QBO reconciliation then has to flag.
--
-- default_expense_account_id is Option-B RECOMMENDATION ONLY (same law as the vendor column, memory
-- `vendor-customer-categorization-option-b`): it pre-fills the account picker when categorizing or
-- creating a bill/expense tied to this driver; the user always sees and can override it — never a
-- silent auto-post, no new GL math, no posting flag touched. Advance-vs-expense TREATMENT stays
-- decided by the chosen account (bank-driver-advance.service.ts), not by this column.
--
-- Additive + idempotent. No RLS/grant change: mdata.drivers already carries its role-scoped RLS +
-- ih35_app grants from 0008 — a new nullable column inherits them automatically.
BEGIN;

ALTER TABLE mdata.drivers
  ADD COLUMN IF NOT EXISTS default_expense_account_id uuid REFERENCES catalogs.accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN mdata.drivers.default_expense_account_id IS
  'banking-b4: Option-B RECOMMENDATION ONLY (never a silent auto-post): pre-fills the GL account picker when a bank transaction / bill / expense is categorized to this driver — mirrors mdata.vendors.default_expense_account_id. The user always sees and can override the pre-filled value before saving. FK catalogs.accounts, ON DELETE SET NULL so a retired account never blocks driver edits.';

CREATE INDEX IF NOT EXISTS idx_drivers_default_expense_account_id
  ON mdata.drivers (default_expense_account_id)
  WHERE default_expense_account_id IS NOT NULL AND deactivated_at IS NULL;

COMMIT;

-- ROLLBACK (owner-only, Neon branch):
--   DROP INDEX IF EXISTS mdata.idx_drivers_default_expense_account_id;
--   ALTER TABLE mdata.drivers DROP COLUMN IF EXISTS default_expense_account_id;
