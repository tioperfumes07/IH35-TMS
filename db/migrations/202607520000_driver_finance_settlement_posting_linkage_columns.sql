-- =====================================================================================================
-- [HOLD-FOR-JORGE — FINANCIAL] Settlement engine collapse — STEP 1 (additive posting-linkage columns)
-- DO NOT RUN ON PROD via db:migrate. Runs on a Neon branch by Jorge's hand, then ledger-backfilled so
-- prod db:migrate skips it; CI (fresh-from-0001) applies it so Step 2's writer repoint + schema-parity
-- have the columns. Registered in db/migrations/.held-migrations.json.
-- =====================================================================================================
--
-- WHY: the WRITER collapse (payroll.* / settlement.* → canonical driver_finance.*) is blocked because
-- canonical driver_finance.driver_settlements / settlement_lines LACK the posting + QBO-bill linkage
-- columns the RETIRE payroll.driver_settlements / driver_settlement_line_items writers set at create/post
-- time. This migration adds ONLY those missing columns so the writers can repoint (Step 2) without
-- losing the settlement→bill / settlement→GL linkage.
--
-- SAFETY:
--   * ADDITIVE + IDEMPOTENT only (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS) — safe to run twice.
--   * NO data migration: payroll.driver_settlements + driver_settlement_line_items are EMPTY on prod
--     (0 rows, verified on branch br-fancy-credit-akjnd07a 2026-07-15). Canonical is empty too.
--   * NO RLS / GRANT change: ADD COLUMN inherits the table's existing FORCED-RLS policies + ih35_app grants.
--   * All new columns NULLABLE — a draft settlement has no posting linkage until it is posted; the create
--     path sets created_by_user_id / bank_settle_date, the post path sets the accounting_/qbo_/posted_ set.
--   * Plain typed columns (no new cross-schema FKs here) to keep Step 1 additive-only and match the RETIRE
--     payroll.* columns' shapes; referential FKs (accounting.bills / bill_payments, identity.users,
--     catalogs.accounts) can be added as a NOT-VALID follow-up if GUARD wants them.
--
-- COLUMN MAP (writer that sets each — see payroll/driver-settlement.service.ts, settlements/auto-deductions,
-- settlements/team-splits):
--   HEADER driver_finance.driver_settlements:
--     accounting_bill_id          uuid  <- post UPDATE (bill.id)                     [GUARD list]
--     accounting_bill_payment_id  uuid  <- post UPDATE (payment.id)                  [GUARD list]
--     qbo_bill_id                 text  <- post UPDATE (bill.qbo_bill_id)            [GUARD list]
--     qbo_bill_payment_id         text  <- post UPDATE (payment.qbo_bill_payment_id) [+ beyond GUARD's 5: writer sets it, pairs with accounting_bill_payment_id]
--     posted_at                   timestamptz <- post UPDATE (now())                [GUARD list]
--     posted_by_user_id           uuid  <- post UPDATE (userId)                     [GUARD list]
--     bank_settle_date            date  <- create INSERT (input.bankSettleDate)     [+ beyond GUARD's 5: create path sets it]
--     created_by_user_id          uuid  <- create INSERT (userId)                   [+ beyond GUARD's 5: create path sets it]
--   LINE driver_finance.settlement_lines:
--     posting_account_id          uuid  <- create + auto-deduction line INSERTs     [GUARD list]
--     (auto_deduction_policy_id + split_partner_driver_id ALREADY EXIST on canonical — no add.)
--
-- The 3 columns "beyond GUARD's 5" (qbo_bill_payment_id, bank_settle_date, created_by_user_id) are added
-- because the actual writers set them; Step 2 cannot repoint without them. GUARD: trim here if the
-- canonical model intends to relocate any (e.g. created_by via audit_events) before applying on Neon.

ALTER TABLE driver_finance.driver_settlements
  ADD COLUMN IF NOT EXISTS accounting_bill_id          uuid,
  ADD COLUMN IF NOT EXISTS accounting_bill_payment_id  uuid,
  ADD COLUMN IF NOT EXISTS qbo_bill_id                 text,
  ADD COLUMN IF NOT EXISTS qbo_bill_payment_id         text,
  ADD COLUMN IF NOT EXISTS posted_at                   timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by_user_id           uuid,
  ADD COLUMN IF NOT EXISTS bank_settle_date            date,
  ADD COLUMN IF NOT EXISTS created_by_user_id          uuid;

ALTER TABLE driver_finance.settlement_lines
  ADD COLUMN IF NOT EXISTS posting_account_id          uuid;

-- Reverse drill-through (LAW OF THE LAND §10a — total connectivity): a bill / bill-payment must be able
-- to find its driver settlement. Partial indexes (only posted rows carry the linkage).
CREATE INDEX IF NOT EXISTS idx_df_driver_settlements_accounting_bill_id
  ON driver_finance.driver_settlements (accounting_bill_id)
  WHERE accounting_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_df_driver_settlements_accounting_bill_payment_id
  ON driver_finance.driver_settlements (accounting_bill_payment_id)
  WHERE accounting_bill_payment_id IS NOT NULL;
