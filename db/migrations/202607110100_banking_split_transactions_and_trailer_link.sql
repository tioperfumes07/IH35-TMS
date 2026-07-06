-- [HOLD-FOR-JORGE — TIER 1] BANK-SPLIT-1 — Bank transaction SPLIT + full linkage (Driver/Unit/Trailer/Load).
-- DO NOT RUN ON PROD by preDeploy db:migrate. Runs on a Neon branch under GUARD/Jorge before prod, then is
-- ledger-backfilled so prod db:migrate skips it (see db/migrations/.held-migrations.json).
--
-- WHY: banking.bank_transactions/categorization.routes.ts already supports a single-line categorize with
-- Vendor/Customer/Driver/Unit/Trip(Load)/Item tags (BLOCK-6/6b). The QBO-style SPLIT TRANSACTIONS popup
-- (Jorge's 2026-07-05 design) needs a real persisted multi-line split model — the prior endpoint
-- (POST /transactions/:id/split) HONESTLY returns 501 today (see banking.routes.ts) because no such table
-- exists. This migration builds it. Purely additive + idempotent. NO new GL math: every downstream record
-- a split line can produce REUSES an existing, already-shipped writer, parameterized on that line's own
-- validated amount instead of the whole transaction's amount:
--   - a split line tagged to a Driver + the entity's driver-advance receivable account REUSES
--     createEmployeeLoanCore + disburseDriverAdvanceCore (BLOCK-6, bank-driver-advance.service.ts) —
--     unmodified functions, just called once per eligible line.
--   - a plain vendor+category split line (e.g. NAPA/AutoZone) REUSES the exact accounting.bills INSERT
--     shape already used by bulkPostTransactionsAsBills (bulk-transactions.ts, "Post as bill") — same
--     columns/values pattern, invoked per line instead of per whole transaction. No new GL posting
--     (accounting.bills carries no journal_entry_id — creating one is booking a payable, not GL math).
--
-- Parts:
--   1) banking.bank_transactions: add categorization_trailer_id (Part 1 — trailer is the 4th linkage
--      dimension alongside Driver/Unit/Trip; trailers are mdata.equipment, NEVER mdata.loads.trailer_id —
--      there is no such column) + split_mode (single_vendor_multi_category | multi_vendor).
--   2) banking.bank_transaction_splits — the new split-lines table. FORCE RLS, entity-scoped, void-not-
--      delete, is_active + audit (audit rows are appended via appendCrudAudit in the route layer, matching
--      every sibling banking table — no DB-level audit trigger exists on banking.bank_transactions either).
--   3) accounting.bills.source_bank_transaction_id — REVERSE drill-through (bill -> the bank transaction
--      that produced it), mirroring the identical column already on accounting.payments/bill_payments
--      (migration 0165, P6-T11204). Forward drill (split line -> bill) is bank_transaction_splits.result_bill_id.
--   4) Seed two OFF-by-default flags: BANK_TX_SPLIT_ENABLED (gates persisting/committing a split — reads
--      are harmless and ungated) and BANK_TX_SPLIT_GL_POSTING_ENABLED (gates the two reused per-line
--      posting branches above: driver cash-advance and vendor bill creation).

BEGIN;

-- ── 1) banking.bank_transactions — Part 1 linkage (trailer) + split marker ─────────────────────────────
ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_trailer_id uuid NULL REFERENCES mdata.equipment(id);

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS split_mode text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_transactions_split_mode_check'
      AND conrelid = 'banking.bank_transactions'::regclass
  ) THEN
    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_transactions_split_mode_check
      CHECK (split_mode IS NULL OR split_mode IN ('single_vendor_multi_category', 'multi_vendor'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_trailer
  ON banking.bank_transactions (operating_company_id, categorization_trailer_id)
  WHERE categorization_trailer_id IS NOT NULL;

-- ── 2) banking.bank_transaction_splits — the split-lines table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banking.bank_transaction_splits (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id      uuid NOT NULL REFERENCES org.companies(id),
  bank_transaction_id       uuid NOT NULL REFERENCES banking.bank_transactions(id),
  line_no                   smallint NOT NULL,
  -- Magnitude only (same direction as the parent transaction's is_credit); lines must sum to
  -- abs(bank_transactions.amount_cents) — enforced at the application layer (assertBalanced-style check),
  -- not in DDL (a partial draft is allowed to not yet sum while the operator is still editing).
  amount_cents              bigint NOT NULL CHECK (amount_cents > 0),
  category_kind             text NULL,
  gl_account_id             uuid NULL REFERENCES catalogs.accounts(id),
  vendor_id                 uuid NULL REFERENCES mdata.vendors(id),
  customer_id               uuid NULL REFERENCES mdata.customers(id),
  driver_id                 uuid NULL REFERENCES mdata.drivers(id),
  unit_id                   uuid NULL REFERENCES mdata.units(id),
  trailer_id                uuid NULL REFERENCES mdata.equipment(id),
  load_id                   uuid NULL REFERENCES mdata.loads(id),
  item_id                   uuid NULL REFERENCES catalogs.items(id),
  memo                      text NULL,
  recover_from_driver       boolean NOT NULL DEFAULT false,
  recover_deduction_type    text NULL,
  -- Downstream provenance (forward link: split line -> the record it produced).
  posting_status            text NOT NULL DEFAULT 'draft'
                              CHECK (posting_status IN ('draft', 'posted', 'skipped_pending_gl_wiring', 'void')),
  posting_reason            text NULL,
  result_driver_advance_id  uuid NULL REFERENCES driver_finance.driver_advances(id),
  result_deduction_id       uuid NULL REFERENCES driver_finance.driver_settlement_deductions(id),
  result_bill_id            uuid NULL REFERENCES accounting.bills(id),
  result_journal_entry_id   uuid NULL REFERENCES accounting.journal_entries(id),
  voided_at                 timestamptz NULL,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by_user_id        uuid NULL REFERENCES identity.users(id),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id        uuid NULL REFERENCES identity.users(id)
);

-- Idempotent add in case a prior partial apply created the table without this column.
ALTER TABLE banking.bank_transaction_splits ADD COLUMN IF NOT EXISTS result_bill_id uuid NULL REFERENCES accounting.bills(id);

-- One active line per (bank_transaction_id, line_no); a voided line frees its slot for re-numbering.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bank_tx_splits_txn_line_active
  ON banking.bank_transaction_splits (bank_transaction_id, line_no)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_company_txn
  ON banking.bank_transaction_splits (operating_company_id, bank_transaction_id)
  WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_driver
  ON banking.bank_transaction_splits (operating_company_id, driver_id)
  WHERE driver_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_unit
  ON banking.bank_transaction_splits (operating_company_id, unit_id)
  WHERE unit_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_trailer
  ON banking.bank_transaction_splits (operating_company_id, trailer_id)
  WHERE trailer_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_load
  ON banking.bank_transaction_splits (operating_company_id, load_id)
  WHERE load_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_vendor
  ON banking.bank_transaction_splits (operating_company_id, vendor_id)
  WHERE vendor_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_splits_result_bill
  ON banking.bank_transaction_splits (result_bill_id)
  WHERE result_bill_id IS NOT NULL;

-- FORCED RLS — entity-scoped, mirrors banking.bank_transactions' own policy shape (0065 pattern).
ALTER TABLE banking.bank_transaction_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.bank_transaction_splits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bank_tx_splits_select ON banking.bank_transaction_splits;
CREATE POLICY bank_tx_splits_select ON banking.bank_transaction_splits
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS bank_tx_splits_insert ON banking.bank_transaction_splits;
CREATE POLICY bank_tx_splits_insert ON banking.bank_transaction_splits
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS bank_tx_splits_update ON banking.bank_transaction_splits;
CREATE POLICY bank_tx_splits_update ON banking.bank_transaction_splits
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

-- Grants — void-not-delete (SELECT/INSERT/UPDATE only; no DELETE policy + no DELETE grant).
GRANT SELECT, INSERT, UPDATE ON banking.bank_transaction_splits TO ih35_app;
REVOKE DELETE ON banking.bank_transaction_splits FROM ih35_app;

-- ── 3) accounting.bills — REVERSE drill-through to the originating bank transaction ──────────────────────
-- Mirrors the identical source_bank_transaction_id column already on accounting.payments and
-- accounting.bill_payments (migration 0165_p6_t11204_bank_tx_categorization.sql) — same pattern, same name,
-- extended to accounting.bills so a split-line-created bill is reverse-drillable to its bank transaction
-- without parsing the memo JSON.
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS source_bank_transaction_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('banking.bank_transactions') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_source_bank_transaction_id_fkey'
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_source_bank_transaction_id_fkey
      FOREIGN KEY (source_bank_transaction_id)
      REFERENCES banking.bank_transactions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bills_source_bank_txn
  ON accounting.bills (source_bank_transaction_id)
  WHERE source_bank_transaction_id IS NOT NULL;

-- ── 4) Seed the OFF-by-default flags (idempotent; guarded on lib.feature_flags existing) ────────────────
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'BANK_TX_SPLIT_ENABLED',
      'BANK-SPLIT-1: enables the QBO-style Split transaction popup — persisting/committing multi-line '
        || 'splits on a bank transaction (single-vendor-multi-category or multi-vendor). Reads are always '
        || 'allowed; this flag gates the write path. OFF until GUARD-verified + owner flip.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;

    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'BANK_TX_SPLIT_GL_POSTING_ENABLED',
      'BANK-SPLIT-1: on commit, each split line REUSES an existing writer for its own amount — a Driver '
        || 'line on the entity''s driver-advance account REUSES createEmployeeLoanCore + '
        || 'disburseDriverAdvanceCore (BLOCK-6); a Vendor+category line REUSES the accounting.bills INSERT '
        || 'shape from bulkPostTransactionsAsBills ("Post as bill"). OFF until GUARD-verified + owner flip; '
        || 'with the flag off every line commits tagged-only (posting_status=skipped_pending_gl_wiring).',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'banking' AND table_name = 'bank_transactions'
       AND column_name IN ('categorization_trailer_id', 'split_mode')
     HAVING COUNT(*) = 2
  )) AS bank_transactions_split1_columns_ok,
  (SELECT to_regclass('banking.bank_transaction_splits') IS NOT NULL) AS bank_transaction_splits_table_exists,
  (SELECT EXISTS (
     SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'accounting' AND table_name = 'bills' AND column_name = 'source_bank_transaction_id'
  )) AS bills_source_bank_txn_column_ok,
  (SELECT COUNT(*) FROM lib.feature_flags
     WHERE flag_key IN ('BANK_TX_SPLIT_ENABLED', 'BANK_TX_SPLIT_GL_POSTING_ENABLED')
       AND default_enabled = false) AS split_flags_seeded_off;
