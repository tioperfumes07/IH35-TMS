-- 202616670100_capture_undocumented_live_reinstate_columns.sql
--
-- GOVERNANCE FIX, not a schema change on prod. The void/reinstate engine (void-document-stamp.service.ts
-- stampDocumentReinstated, spec.hasReinstateCols; reinstate-document.service.ts) writes reinstated_at, reinstate_reason,
-- reinstated_by_user_id, reinstated_from_void_je_id (and reads status_before_void) on 17 document tables. Those 79
-- columns exist LIVE on prod (information_schema measured 2026-11-18 11:40Z, every one nullable, no default, types
-- below) but no committed migration creates them — so a fresh-migrated database (CI) refuses every reinstate with
-- "column reinstated_at does not exist" (reinstate-driver-bill.db.test.ts, build-typecheck-heavy). Same gap class as
-- 202614700000_capture_undocumented_live_columns_je_reinstate_bank_factoring.sql, which captured journal_entries only.
--
-- Additive only, idempotent (ADD COLUMN IF NOT EXISTS) — a no-op on prod, where every column already exists with
-- exactly these types. No data, no default, no constraint, no GL. Reverse: nothing to reverse on prod.

ALTER TABLE accounting.bill_payments
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE accounting.credit_memos
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE accounting.factoring_advances
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid;

ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE accounting.payments
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE accounting.prepaid_assets
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE driver_finance.driver_bills
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE driver_finance.driver_liabilities
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid;

ALTER TABLE driver_finance.driver_reimbursements
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE driver_finance.driver_settlement_deductions
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE driver_finance.driver_settlements
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS reinstate_reason text,
  ADD COLUMN IF NOT EXISTS reinstated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reinstated_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reinstated_from_void_je_id uuid,
  ADD COLUMN IF NOT EXISTS status_before_void text;
