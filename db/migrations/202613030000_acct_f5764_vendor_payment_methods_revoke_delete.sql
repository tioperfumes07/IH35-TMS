-- ACCT-F5764 — accounting.vendor_payment_methods (202612640000) was created with an explicit
-- GRANT SELECT, INSERT, UPDATE to ih35_app, but never the accompanying REVOKE DELETE every sibling
-- WORM table's own creating migration carries (see 202607110200_civil_fines_voidable.sql's own comment:
-- "0065 supersedes it schema-wide" — migration 0065 runs ALTER DEFAULT PRIVILEGES IN SCHEMA accounting
-- GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app, so EVERY table created afterward in this
-- schema inherits DELETE by default regardless of its own narrower table-level GRANT — a table-level
-- GRANT only ADDS privileges, it cannot subtract what the default-privilege rule already provided).
--
-- Live-confirmed the real-world consequence differs by environment: on Neon prod, ih35_app currently
-- has NO DELETE on this table (has_table_privilege = false) — most likely from an out-of-band manual
-- REVOKE that was never captured in a migration file. A FRESH database built from db/migrations/ alone
-- (exactly what CI's integration test suite does) does NOT have that out-of-band fix, so
-- vendor-payment-methods-master-data.db.test.ts's own assertion (`can_delete` must be false) fails
-- there — not a test bug, a real migration-file gap that only prod's manual history happened to paper
-- over. This migration closes that gap AT THE SOURCE so a fresh deploy/disaster-recovery/CI database
-- matches prod's already-correct, already-WORM-protected intent, not just prod's current lucky state.
--
-- Idempotent: REVOKE on a privilege that is already absent is a silent no-op in Postgres.

BEGIN;

REVOKE DELETE ON accounting.vendor_payment_methods FROM ih35_app;

COMMIT;
