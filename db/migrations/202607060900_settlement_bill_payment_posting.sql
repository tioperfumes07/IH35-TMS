-- SETTLEMENT-BILL-PAYMENT — the canonical driver-settlement GL posting shape (blueprint §3, LOCKED).
-- BUILD-AND-HOLD; posting flag SETTLEMENT_GL_POSTING_ENABLED stays OFF. Additive + idempotent + fresh-DB-safe.
--
-- Driver settlements post as Bill + BillPayment (driver = a VENDOR): ONE Bill per LOAD (numbered by the
-- load #), deductions reduce A/P and credit the DRIVER'S OWN sub-accounts, one net BillPayment to DIP.
-- This migration adds ONLY the connectivity + idempotency spine + the non-cash-deduction marker; it
-- introduces NO GL math (that lives in the reused createBill/payBill/createJournalEntry/postSourceTransaction
-- infra). Driver settlements live ONLY in TRANSP and never cross-post.
BEGIN;

-- ---------------------------------------------------------------------------------------------
-- (1) Non-cash deduction marker on bill_payments.
-- A settlement's deductions are recovered from the driver (advance repaid / escrow withheld), NOT paid
-- in cash. To close each per-load Bill's A/P in the subledger WITHOUT a phantom cash outflow, the engine
-- records a NON-CASH bill_payment (from_bank_account_id NULL) for the deduction share of each bill. Its
-- GL is owned by the settlement deduction JE (Dr A/P / Cr the driver's own sub-account), so the shared
-- bill-payment poster MUST skip it (buildBillPaymentLines / runPostingEngineMvpBackfill) to avoid a
-- double A/P reduction + a spurious cash credit. Default false => zero behavior change for every
-- existing bill_payment.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE accounting.bill_payments
  ADD COLUMN IF NOT EXISTS settlement_deduction_noncash boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_bill_payments_settlement_deduction_noncash
  ON accounting.bill_payments (operating_company_id)
  WHERE settlement_deduction_noncash = true;

-- ---------------------------------------------------------------------------------------------
-- (2) Settlement GL posting run — the idempotency anchor + settlement-level connectivity.
-- One row per posted settlement (UNIQUE settlement_id): links the settlement -> driver -> driver-vendor
-- -> the deduction JE -> its totals. void-not-delete via reversed_at (a reversal flips status, never
-- deletes). run_key mirrors the deterministic idempotency key the engine computes.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.driver_settlement_gl_runs (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid NOT NULL REFERENCES org.companies(id),
  settlement_id               uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
  driver_id                   uuid NOT NULL REFERENCES mdata.drivers(id),
  driver_vendor_id            text NOT NULL,
  run_key                     text NOT NULL,
  gross_cents                 bigint NOT NULL DEFAULT 0,
  deductions_cents            bigint NOT NULL DEFAULT 0,
  net_cents                   bigint NOT NULL DEFAULT 0,
  deduction_journal_entry_id  uuid REFERENCES accounting.journal_entries(id),
  status                      text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  posted_by_user_id           uuid REFERENCES identity.users(id),
  reversed_at                 timestamptz,
  reversed_by_user_id         uuid REFERENCES identity.users(id),
  reversal_reason             text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_driver_settlement_gl_runs_settlement UNIQUE (operating_company_id, settlement_id),
  CONSTRAINT uq_driver_settlement_gl_runs_runkey UNIQUE (operating_company_id, run_key)
);

CREATE INDEX IF NOT EXISTS ix_driver_settlement_gl_runs_driver
  ON driver_finance.driver_settlement_gl_runs (operating_company_id, driver_id);

-- ---------------------------------------------------------------------------------------------
-- (3) Per-load Bill connectivity — the "one Bill per LOAD" spine.
-- One row per driver_bill posted for the settlement: links the driver_bill -> its load -> the
-- accounting.bills row -> the bill's GL JE -> the cash + non-cash(deduction) bill_payments. Both
-- directions drill-through (settlement <-> bill <-> load). UNIQUE(driver_bill_id) => a driver bill
-- is billed at most once.
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_finance.driver_settlement_gl_bills (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid NOT NULL REFERENCES org.companies(id),
  run_id                      uuid NOT NULL REFERENCES driver_finance.driver_settlement_gl_runs(id),
  settlement_id               uuid NOT NULL REFERENCES driver_finance.driver_settlements(id),
  driver_bill_id              uuid NOT NULL REFERENCES driver_finance.driver_bills(id),
  load_id                     uuid REFERENCES mdata.loads(id),
  load_number                 text,
  accounting_bill_id          uuid NOT NULL REFERENCES accounting.bills(id),
  bill_journal_entry_id       uuid REFERENCES accounting.journal_entries(id),
  cash_bill_payment_id        uuid REFERENCES accounting.bill_payments(id),
  cash_journal_entry_id       uuid REFERENCES accounting.journal_entries(id),
  deduction_bill_payment_id   uuid REFERENCES accounting.bill_payments(id),
  gross_cents                 bigint NOT NULL DEFAULT 0,
  deduction_cents             bigint NOT NULL DEFAULT 0,
  cash_cents                  bigint NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_driver_settlement_gl_bills_driver_bill UNIQUE (operating_company_id, driver_bill_id)
);

CREATE INDEX IF NOT EXISTS ix_driver_settlement_gl_bills_run
  ON driver_finance.driver_settlement_gl_bills (run_id);
CREATE INDEX IF NOT EXISTS ix_driver_settlement_gl_bills_settlement
  ON driver_finance.driver_settlement_gl_bills (operating_company_id, settlement_id);
CREATE INDEX IF NOT EXISTS ix_driver_settlement_gl_bills_load
  ON driver_finance.driver_settlement_gl_bills (load_id) WHERE load_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- (4) FORCED RLS + entity policies + grants (0065 pattern). Both tables are TRANSP-scoped connectivity
-- records (not audit): SELECT/INSERT/UPDATE for ih35_app, NEVER DELETE (void-not-delete via reversed_at).
-- ---------------------------------------------------------------------------------------------
ALTER TABLE driver_finance.driver_settlement_gl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_settlement_gl_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_settlement_gl_runs_tenant_scope ON driver_finance.driver_settlement_gl_runs;
CREATE POLICY driver_settlement_gl_runs_tenant_scope ON driver_finance.driver_settlement_gl_runs
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id::text = current_setting('app.operating_company_id', true)
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id::text = current_setting('app.operating_company_id', true)
);
GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_settlement_gl_runs TO ih35_app;

ALTER TABLE driver_finance.driver_settlement_gl_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.driver_settlement_gl_bills FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS driver_settlement_gl_bills_tenant_scope ON driver_finance.driver_settlement_gl_bills;
CREATE POLICY driver_settlement_gl_bills_tenant_scope ON driver_finance.driver_settlement_gl_bills
FOR ALL TO ih35_app
USING (
  identity.is_lucia_bypass()
  OR operating_company_id::text = current_setting('app.operating_company_id', true)
)
WITH CHECK (
  identity.is_lucia_bypass()
  OR operating_company_id::text = current_setting('app.operating_company_id', true)
);
GRANT SELECT, INSERT, UPDATE ON driver_finance.driver_settlement_gl_bills TO ih35_app;

-- ---------------------------------------------------------------------------------------------
-- (5) Align the entity-default net-pay floor to the owner-LOCKED 5% (was 10%). Only the column DEFAULT
-- changes; existing owner-set rows are untouched (owner-owned). The applier resolves per-driver ->
-- per-company -> env(5%) so an absent config row already floors at 5%.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE accounting.settlement_posting_config
  ALTER COLUMN net_pay_floor_pct SET DEFAULT 0.0500;

-- ---------------------------------------------------------------------------------------------
-- (6) Register the per-entity deduction-apply flag row (code-only until now) + re-affirm the money flag,
-- both DEFAULT OFF. Idempotent — never flips an existing row.
-- ---------------------------------------------------------------------------------------------
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES
  ('SETTLEMENT_GL_POSTING_ENABLED',
   'Post locked driver settlements as Bill + BillPayment (driver=vendor): one Bill per load (Dr driver-pay / Cr A/P), deductions Dr A/P / Cr the driver''s own advance-asset + escrow-liability sub-accounts, net BillPayment Dr A/P / Cr Wells Fargo DIP. DEFAULT OFF — owner-gated, TRANSP-first.',
   false, 0),
  ('SETTLEMENT_DEDUCTION_APPLY_ENABLED',
   'Apply pending driver_settlement_deductions into the load-bookended close (pay-first-then-escrow, 5% editable net floor) BEFORE net_pay is recomputed. DEFAULT OFF — owner-gated.',
   false, 0)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;
