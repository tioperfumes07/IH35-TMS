-- P7 Wave 2 v3 — source_system / QBO sync bookkeeping columns on accounting entities.

BEGIN;

-- ─── Shared ALTER helpers via repeated blocks (additive IF NOT EXISTS) ─────────

ALTER TABLE accounting.invoices
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms'
    CHECK (source_system IN ('tms', 'qbo')),
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_int int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qbo_idempotency_key text,
  ADD COLUMN IF NOT EXISTS qbo_invoice_id text,
  ADD COLUMN IF NOT EXISTS qbo_sync_pending boolean NOT NULL DEFAULT false;

ALTER TABLE accounting.bills
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms'
    CHECK (source_system IN ('tms', 'qbo')),
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_int int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qbo_idempotency_key text;

ALTER TABLE accounting.payments
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms'
    CHECK (source_system IN ('tms', 'qbo')),
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_int int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qbo_idempotency_key text,
  ADD COLUMN IF NOT EXISTS qbo_payment_id text,
  ADD COLUMN IF NOT EXISTS qbo_sync_pending boolean NOT NULL DEFAULT false;

ALTER TABLE accounting.bill_payments
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms'
    CHECK (source_system IN ('tms', 'qbo')),
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_int int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qbo_idempotency_key text;

ALTER TABLE accounting.journal_entries
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms'
    CHECK (source_system IN ('tms', 'qbo')),
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_int int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qbo_idempotency_key text;

ALTER TABLE accounting.credit_memos
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms'
    CHECK (source_system IN ('tms', 'qbo')),
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_int int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qbo_idempotency_key text,
  ADD COLUMN IF NOT EXISTS qbo_credit_memo_id text,
  ADD COLUMN IF NOT EXISTS qbo_sync_pending boolean NOT NULL DEFAULT false;

ALTER TABLE accounting.factoring_advances
  ADD COLUMN IF NOT EXISTS source_system text NOT NULL DEFAULT 'tms'
    CHECK (source_system IN ('tms', 'qbo')),
  ADD COLUMN IF NOT EXISTS last_qbo_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS version_int int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qbo_idempotency_key text,
  ADD COLUMN IF NOT EXISTS qbo_advance_id text,
  ADD COLUMN IF NOT EXISTS qbo_sync_pending boolean NOT NULL DEFAULT false;

-- ─── Partial uniques: qbo cloud ids ─────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_qbo_invoice_id
  ON accounting.invoices (operating_company_id, qbo_invoice_id)
  WHERE qbo_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_qbo_payment_id
  ON accounting.payments (operating_company_id, qbo_payment_id)
  WHERE qbo_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_memos_company_qbo_credit_memo_id
  ON accounting.credit_memos (operating_company_id, qbo_credit_memo_id)
  WHERE qbo_credit_memo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_adv_company_qbo_advance_id
  ON accounting.factoring_advances (operating_company_id, qbo_advance_id)
  WHERE qbo_advance_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_company_qbo_bill_id
  ON accounting.bills (operating_company_id, qbo_bill_id)
  WHERE qbo_bill_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_company_qbo_bp_id
  ON accounting.bill_payments (operating_company_id, qbo_bill_payment_id)
  WHERE qbo_bill_payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_company_qbo_je_id
  ON accounting.journal_entries (operating_company_id, qbo_journal_entry_id)
  WHERE qbo_journal_entry_id IS NOT NULL;

-- ─── Idempotency keys (nullable; uniqueness only when set) ───────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_company_qbo_idempotency_key
  ON accounting.invoices (operating_company_id, qbo_idempotency_key)
  WHERE qbo_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bills_company_qbo_idempotency_key
  ON accounting.bills (operating_company_id, qbo_idempotency_key)
  WHERE qbo_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_company_qbo_idempotency_key
  ON accounting.payments (operating_company_id, qbo_idempotency_key)
  WHERE qbo_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_company_qbo_idempotency_key
  ON accounting.bill_payments (operating_company_id, qbo_idempotency_key)
  WHERE qbo_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journal_entries_company_qbo_idempotency_key
  ON accounting.journal_entries (operating_company_id, qbo_idempotency_key)
  WHERE qbo_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_memos_company_qbo_idempotency_key
  ON accounting.credit_memos (operating_company_id, qbo_idempotency_key)
  WHERE qbo_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_factoring_adv_company_qbo_idempotency_key
  ON accounting.factoring_advances (operating_company_id, qbo_idempotency_key)
  WHERE qbo_idempotency_key IS NOT NULL;

-- ─── mdata.vendors — 1099 / tax ───────────────────────────────────────────────────

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS eligible_1099 boolean NOT NULL DEFAULT false;

ALTER TABLE mdata.vendors
  ADD COLUMN IF NOT EXISTS tax_id text;

COMMIT;
