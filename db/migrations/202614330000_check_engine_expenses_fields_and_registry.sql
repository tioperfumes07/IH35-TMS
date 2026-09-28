-- 202614330000_check_engine_expenses_fields_and_registry.sql
-- R-154 / R-154.1 (Lead owner ruling: docs/bus/09-25-2026-Codex-ROUND-154-CHECK-ENGINE-QBO-PARITY-BUILD-START-TO-FINISH.md).
-- Claimed #202614330000, purpose matches db/migrations/CLAIMED-MIGRATION-NUMBERS.json verbatim.
--
-- ARCHITECTURE (Lead ruling, §2 of the round-154 spec): a Check IS an accounting.expenses row with
-- payment_type='check'. No parallel document table -- this keeps the existing costs guard (5xxx/6xxx
-- debit needs an expenses row), all existing expense linkage (unit/trailer/driver/load/WO/insurance/
-- legal/class/recover_from_driver), and every Load Costs / Pre-Settlement / Settlement read that
-- already reads expense lines, working day one. A check that pays a bill is a bill_payment row with
-- payment_method='CHECK' + check_number (bill_payments already has payment_method + check_number per
-- prior migrations -- not touched here). Both share ONE check-number registry and ONE print queue.
--
-- Live-verified before writing (Neon br-fancy-credit-akjnd07a, information_schema): none of the new
-- columns/tables below exist yet; identity.users/org.companies/mdata.customers/accounting.expenses/
-- banking.bank_accounts all confirmed live with the referenced id columns.
--
-- Additive only -- no data change, no backfill, no default/guessed check numbers (next_check_number
-- starts NULL; the owner types the first real number before any check can print). FORCE RLS on every
-- new table, same shape as banking.bank_transactions / reconciler.exceptions. No bank routing/account
-- numbers stored anywhere here. No DELETE grants on the registry or the print-batch audit tables --
-- void-not-delete throughout. Idempotent: guarded IF NOT EXISTS / DO blocks, safe to re-run.
--
-- CANONICAL-CHECK: money-concept = "check" (a bank-drawn payment instrument, disbursement side, and
-- its physical print lifecycle). Checked scripts/canonical-ledger-registry.json's concepts (advance/
-- cash_advance/cash_advance_request/settlement/settlement_line/settlement_deduction/
-- driver_payment_method/payment_method/escrow/factoring_ledger/invoice/bill/journal_entry/
-- bank_transaction) -- none of them is "check", "check_number_registry", "check_stock_settings", or
-- "check_print_batch(_items)"; no collision. The DOCUMENT side of a check is not a new ledger at all:
-- per the Lead's own R-154 ruling this migration implements, a check IS accounting.expenses
-- (payment_type='check') or accounting.bill_payments (payment_method='CHECK') -- both pre-existing
-- canonical tables, unmodified in their document shape by this migration. What IS new here is
-- non-document state those two already-canonical tables don't carry: the shared check-number
-- registry (banking.check_number_registry), per-bank print stock config
-- (banking.check_stock_settings), and the print-batch audit trail
-- (banking.check_print_batches / check_print_batch_items) -- none of which banking.bank_transactions,
-- accounting.bills, or any other existing table represents.

-- 3a. Check fields on the expense document (accounting.expenses already exists; additive columns only)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'payment_type'
  ) THEN
    ALTER TABLE accounting.expenses
      ADD COLUMN payment_type text NOT NULL DEFAULT 'expense'
        CHECK (payment_type IN ('expense', 'check', 'cash', 'credit_card')),
      ADD COLUMN check_number text,
      ADD COLUMN print_status text NOT NULL DEFAULT 'not_set'
        CHECK (print_status IN ('not_set', 'need_to_print', 'print_complete')),
      ADD COLUMN payee_kind text
        CHECK (payee_kind IN ('vendor', 'driver', 'customer', 'employee')),
      ADD COLUMN payee_customer_uuid uuid REFERENCES mdata.customers(id),
      ADD COLUMN remit_to_address jsonb,
      ADD COLUMN print_on_check_name text,
      ADD COLUMN printed_at timestamptz,
      ADD COLUMN printed_by_user_id uuid REFERENCES identity.users(id),
      ADD COLUMN print_batch_id uuid;
  END IF;
END $$;

-- Guard-law CHECK: a check must declare who it pays. Named separately so it is idempotent on its own
-- (a plain inline CHECK inside the ADD COLUMN block above cannot be re-run once the column exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_check_requires_payee_kind'
  ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_check_requires_payee_kind
      CHECK (payment_type <> 'check' OR payee_kind IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS expenses_payment_type_print_status_idx
  ON accounting.expenses (operating_company_id, payment_type, print_status);

-- 3b. ONE check-number registry, shared by checks and by bill payments / driver settlement payments
-- made by check -- a single source of truth for "is this number already used on this bank account".
CREATE TABLE IF NOT EXISTS banking.check_number_registry (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  bank_account_id       uuid        NOT NULL REFERENCES banking.bank_accounts(id),
  check_number          text        NOT NULL,
  source_kind           text        NOT NULL
    CHECK (source_kind IN ('check', 'bill_payment', 'driver_settlement_payment')),
  source_id             uuid,
  status                text        NOT NULL
    CHECK (status IN ('issued', 'printed', 'voided', 'spoiled')),
  amount_cents          bigint      NOT NULL DEFAULT 0,
  payee_label           text,
  issued_at             timestamptz NOT NULL DEFAULT now(),
  voided_at             timestamptz,
  void_reason           text,
  voided_by_user_id     uuid        REFERENCES identity.users(id),
  created_by_user_id    uuid        REFERENCES identity.users(id),
  is_sample_data        boolean     NOT NULL DEFAULT false,
  CONSTRAINT check_number_registry_amount_nonneg CHECK (amount_cents >= 0),
  CONSTRAINT check_number_registry_void_fields
    CHECK (status <> 'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)),
  UNIQUE (operating_company_id, bank_account_id, check_number)
);

CREATE INDEX IF NOT EXISTS check_number_registry_source_idx
  ON banking.check_number_registry (source_kind, source_id);
CREATE INDEX IF NOT EXISTS check_number_registry_outstanding_idx
  ON banking.check_number_registry (operating_company_id, bank_account_id, status)
  WHERE status IN ('issued', 'printed');

-- 3c. Per-bank-account check stock / print settings. next_check_number is NULL until the owner types
-- the real starting number -- never seed a guessed one.
CREATE TABLE IF NOT EXISTS banking.check_stock_settings (
  bank_account_id        uuid        PRIMARY KEY REFERENCES banking.bank_accounts(id),
  operating_company_id   uuid        NOT NULL REFERENCES org.companies(id),
  next_check_number      bigint,
  check_type             text        NOT NULL DEFAULT 'voucher'
    CHECK (check_type IN ('voucher', 'standard')),
  offset_x_mm            numeric     NOT NULL DEFAULT 0,
  offset_y_mm            numeric     NOT NULL DEFAULT 0,
  print_company_address  boolean     NOT NULL DEFAULT true,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id     uuid        REFERENCES identity.users(id),
  CONSTRAINT check_stock_settings_next_number_positive
    CHECK (next_check_number IS NULL OR next_check_number > 0)
);

-- 3d. Durable print-batch audit: one row per "print these N checks now" action, and one row per check
-- within that batch, so confirm-all-ok / reprint-from-N (spec §4) has a real audit trail instead of
-- only the registry's current status.
CREATE TABLE IF NOT EXISTS banking.check_print_batches (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  bank_account_id       uuid        NOT NULL REFERENCES banking.bank_accounts(id),
  starting_number       text        NOT NULL,
  check_type            text        NOT NULL CHECK (check_type IN ('voucher', 'standard')),
  status                text        NOT NULL DEFAULT 'printed'
    CHECK (status IN ('printed', 'confirmed', 'reprinting')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid        REFERENCES identity.users(id),
  confirmed_at          timestamptz,
  confirmed_by_user_id  uuid        REFERENCES identity.users(id)
);

-- operating_company_id is carried directly (not only reachable via print_batch_id's parent) --
-- verify-entity-isolation.mjs requires a direct scoping column on every business table, belt-and-
-- suspenders with FORCE RLS even for pure join rows (docs/ci-guards/ENTITY-ISOLATION.md requirement
-- a). Redundant with check_print_batches.operating_company_id by design.
CREATE TABLE IF NOT EXISTS banking.check_print_batch_items (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid        NOT NULL REFERENCES org.companies(id),
  print_batch_id        uuid        NOT NULL REFERENCES banking.check_print_batches(id),
  registry_id           uuid        NOT NULL REFERENCES banking.check_number_registry(id),
  outcome               text        NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'ok', 'spoiled')),
  UNIQUE (print_batch_id, registry_id)
);

CREATE INDEX IF NOT EXISTS check_print_batch_items_batch_idx
  ON banking.check_print_batch_items (print_batch_id);
CREATE INDEX IF NOT EXISTS check_print_batch_items_company_idx
  ON banking.check_print_batch_items (operating_company_id);

-- RLS -- same shape as banking.bank_transactions / reconciler.exceptions: lucia bypass OR
-- operating_company_id = the session GUC.
ALTER TABLE banking.check_number_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.check_number_registry FORCE ROW LEVEL SECURITY;
ALTER TABLE banking.check_stock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.check_stock_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE banking.check_print_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.check_print_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE banking.check_print_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.check_print_batch_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS check_number_registry_company_isolation ON banking.check_number_registry;
CREATE POLICY check_number_registry_company_isolation
  ON banking.check_number_registry
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS check_stock_settings_company_isolation ON banking.check_stock_settings;
CREATE POLICY check_stock_settings_company_isolation
  ON banking.check_stock_settings
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS check_print_batches_company_isolation ON banking.check_print_batches;
CREATE POLICY check_print_batches_company_isolation
  ON banking.check_print_batches
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS check_print_batch_items_via_batch ON banking.check_print_batch_items;
DROP POLICY IF EXISTS check_print_batch_items_company_isolation ON banking.check_print_batch_items;
CREATE POLICY check_print_batch_items_company_isolation
  ON banking.check_print_batch_items
  USING (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    current_setting('app.bypass_rls', true) = 'lucia'
    OR operating_company_id = nullif(current_setting('app.operating_company_id', true), '')::uuid
  );

-- Grants: void-not-delete. No routing/account numbers are stored on any of these tables (bank identity
-- lives only via bank_account_id -> banking.bank_accounts, which already governs that separately).
GRANT SELECT, INSERT, UPDATE ON banking.check_number_registry TO ih35_app;
REVOKE DELETE, TRUNCATE ON banking.check_number_registry FROM ih35_app;
GRANT SELECT, INSERT, UPDATE ON banking.check_stock_settings TO ih35_app;
REVOKE DELETE, TRUNCATE ON banking.check_stock_settings FROM ih35_app;
GRANT SELECT, INSERT, UPDATE ON banking.check_print_batches TO ih35_app;
REVOKE DELETE, TRUNCATE ON banking.check_print_batches FROM ih35_app;
GRANT SELECT, INSERT, UPDATE ON banking.check_print_batch_items TO ih35_app;
REVOKE DELETE, TRUNCATE ON banking.check_print_batch_items FROM ih35_app;
