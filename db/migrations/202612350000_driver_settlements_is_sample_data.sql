-- 202612350000 — driver_finance.driver_settlements: is_sample_data
--
-- WHY: Gate-B sample creates must be findable by a purge query. Every other money create type can be
-- tagged in an existing free-text field (bills.memo, invoices.internal_notes, payments.reference,
-- bill_payments.memo, expenses.memo), but driver_finance.driver_settlements has NO writable free-text
-- column at all — verified live on the prod branch br-fancy-credit-akjnd07a: 54 columns, zero named
-- is_sample_data, and zero named memo/notes/description/internal_notes. Creating a Gate-B settlement
-- today therefore writes an UNTAGGED live financial record into the sole ledger that no purge query can
-- find by tag. This column closes that gap and unblocks SAMPLE_TAG_PATH_READY.
--
-- WHY THIS SHAPE, NOT A memo COLUMN: this is the house pattern, copied verbatim from migration 0403,
-- which added the identical column to the five mdata masters (customers, vendors, drivers, units, loads)
-- — same name, type, nullability and default. A boolean is also indexable for the purge sweep, which a
-- free-text tag is not. Nothing new is invented here.
--
-- WHY NOT void_reason / display_id: both were considered and REJECTED. void_reason is a void-path field —
-- writing a create-time tag into it would put a false statement into a WORM financial record. display_id
-- is the server-generated business identifier an auditor reads; polluting it corrupts settlement
-- numbering.
--
-- SAFETY: purely additive. NOT NULL DEFAULT false, so every one of the existing rows becomes false —
-- i.e. "not sample data", which is the correct and conservative reading of every settlement written
-- before this migration. No backfill, no data movement, no destructive statement, nothing dropped.
-- Idempotent: IF NOT EXISTS on both the column and the index, so a re-run is a no-op.
--
-- NOTE: the column alone is decoration. All FOUR production writers of this table must persist it:
--   apps/backend/src/driver-finance/settlements.routes.ts
--   apps/backend/src/driver-finance/weekly-close.routes.ts
--   apps/backend/src/driver-finance/settlements-mvp.routes.ts
--   apps/backend/src/driver-finance/settlements-load-bookended.service.ts
-- A guard asserts every INSERT into this table carries the column so a fifth writer cannot silently
-- reintroduce the gap.

ALTER TABLE driver_finance.driver_settlements
  ADD COLUMN IF NOT EXISTS is_sample_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_driver_settlements_sample_data
  ON driver_finance.driver_settlements (operating_company_id, is_sample_data);
