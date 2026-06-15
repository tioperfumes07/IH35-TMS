-- GAP-EXPENSES-MODULE-COMPLETION — Phase 1 (foundation)
-- Authors the dormant parent header accounting.expenses (A1-staged; GL posting OFF).
-- A1-READY: journal_entry_id / posting_status / reversed_by_je_id / posted_at carried
-- now (null/unposted) so Phase 2 (GL posting + reversing-JE void) is an additive
-- turn-on, not a schema rewrite. Void OPERATION is NOT built in Phase 1 (columns only).
-- Money on the cents spine (total_amount_cents bigint). Idempotent. Forward-only.
-- See docs/specs/GAP-EXPENSES-MODULE-COMPLETION-DESIGN.md (Gates 1-4 cleared).

BEGIN;

-- 1. Parent header -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accounting.expenses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  expense_number        text,                                   -- per-load LOADNUMBER-seq, set post-attribution by the route (nullable: unattributed expenses have none)
  vendor_uuid           uuid,                                   -- nullable; mirrors bills (no hard FK)
  driver_uuid           uuid NOT NULL REFERENCES mdata.drivers(id),  -- route requires driver_id
  transaction_date      date NOT NULL,
  payment_account_uuid  uuid,                                   -- cash/bank GL acct (CR side, Phase 2)
  payment_term_id       uuid,                                   -- FUTURE/unwired (route does not write yet)
  total_amount_cents    bigint NOT NULL,                        -- integer cents (Gate 2); = sum(expense_lines) enforced in Phase 2 (assertBalanced)
  memo                  text,
  load_id               uuid REFERENCES mdata.loads(id),        -- per-load P&L attribution
  status                text NOT NULL DEFAULT 'draft'           -- document lifecycle; route writes 'posted' (= finalized)
                          CHECK (status IN ('draft', 'posted', 'void')),
  -- A1-ready GL hooks (null/unposted until Phase 2; JE side is source-of-truth) ----
  posting_status        text NOT NULL DEFAULT 'unposted'
                          CHECK (posting_status IN ('unposted', 'posted', 'reversed')),
  posted_at             timestamptz,
  journal_entry_id      uuid REFERENCES accounting.journal_entries(id),   -- convenience denormalization
  reversed_by_je_id     uuid REFERENCES accounting.journal_entries(id),   -- reversing JE on void (Phase 2)
  -- void metadata (columns present; the VOID OPERATION is NOT built in Phase 1) -----
  voided_at             timestamptz,
  voided_by_user_id     uuid REFERENCES identity.users(id),
  void_reason           text,
  -- QBO linkage (Phase 3) — match existing convention ----------------------------
  qbo_purchase_id       text,
  qbo_sync_pending      boolean NOT NULL DEFAULT false,
  -- standing rule: is_active + soft-delete + audit -------------------------------
  is_active             boolean NOT NULL DEFAULT true,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid REFERENCES identity.users(id),     -- route omits today; populated in Phase 2
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id    uuid REFERENCES identity.users(id)
);

-- 2. Indexes -------------------------------------------------------------------
-- Name matches the index migration 0143 pre-declares (guarded on the then-absent
-- table) so the schema-drift guard sees the declared object present.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_expenses_company_expense_number
  ON accounting.expenses (operating_company_id, expense_number)
  WHERE expense_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_company_status
  ON accounting.expenses (operating_company_id, status);

-- 3. RLS -----------------------------------------------------------------------
--    SELECT / INSERT / UPDATE only. No DELETE policy + no DELETE grant =
--    void-not-delete enforced at the DB layer (FORCE RLS denies un-policied ops).
ALTER TABLE accounting.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.expenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_select ON accounting.expenses;
CREATE POLICY expenses_select ON accounting.expenses
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS expenses_insert ON accounting.expenses;
CREATE POLICY expenses_insert ON accounting.expenses
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

DROP POLICY IF EXISTS expenses_update ON accounting.expenses;
CREATE POLICY expenses_update ON accounting.expenses
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
  );

-- 4. Grants (no DELETE — void-not-delete) --------------------------------------
--    Migration 0065 DEFAULT PRIVILEGES on schema accounting auto-grants DELETE on
--    every new table; REVOKE it so the grant matches intent (defense-in-depth on a
--    money table; deletes are also blocked by FORCE RLS + the absence of a DELETE policy).
GRANT SELECT, INSERT, UPDATE ON accounting.expenses TO ih35_app;
REVOKE DELETE ON accounting.expenses FROM ih35_app;

-- 5. Header <- lines FK (child is empty -> no backfill; ON DELETE RESTRICT) -----
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_lines_expense_id_fkey'
      AND conrelid = 'accounting.expense_lines'::regclass
  ) THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_expense_id_fkey
      FOREIGN KEY (expense_id) REFERENCES accounting.expenses(id) ON DELETE RESTRICT;
  END IF;
END
$$;

-- 6. Re-point expense_lines RLS at the now-existing parent ----------------------
--    Migration 202606080040 created this policy in deny-by-default form because
--    the parent header did not exist yet. Now that it does, isolate lines through
--    accounting.expenses (mirrors bill_lines). Without this, lines stay unreadable.
DROP POLICY IF EXISTS expense_lines_company_isolation ON accounting.expense_lines;
CREATE POLICY expense_lines_company_isolation ON accounting.expense_lines
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR expense_id IN (
      SELECT e.id FROM accounting.expenses e
      WHERE e.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR expense_id IN (
      SELECT e.id FROM accounting.expenses e
      WHERE e.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  );

COMMIT;
