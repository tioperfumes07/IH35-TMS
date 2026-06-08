-- ============================================================
-- Migration: 202606080040_enable_rls_bill_lines_expense_lines_line_category_load_required
-- Purpose:   Close tenant-isolation / RLS-off gaps surfaced by the accounting
--            audit on three accounting tables that currently have RLS DISABLED
--            in production (verified live, project tiny-field-89581227):
--              1. accounting.bill_lines                  (RLS off)
--              2. accounting.expense_lines               (RLS off)
--              3. accounting.line_category_load_required  (RLS off — drift; see note)
-- Role:      ih35_app
--
-- ISOLATION-COLUMN FINDINGS (important — drives the policy shape per table):
--   The accounting.invoice_lines reference pattern is:
--     FOR ALL TO ih35_app
--     USING / WITH CHECK (
--       identity.is_lucia_bypass()
--       OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
--     )
--   That pattern requires an operating_company_id column. The three target
--   tables do NOT all have one:
--     * bill_lines                 — NO operating_company_id. Isolated via parent
--                                    accounting.bills.operating_company_id (bill_id FK target
--                                    exists in prod + CI).
--     * expense_lines              — NO operating_company_id. Parent accounting.expenses
--                                    does NOT exist in prod or CI (never created by any
--                                    migration; provisioned externally). Policy is built
--                                    ADAPTIVELY: isolate through accounting.expenses when it
--                                    exists, else DENY-BY-DEFAULT (lucia bypass only).
--     * line_category_load_required — NO operating_company_id and NO company linkage at all.
--                                    It is a GLOBAL reference/config table (columns:
--                                    line_category PK, description, effective_from) listing
--                                    expense line categories that must tie to a load. OCI
--                                    isolation is not applicable; we restore the original
--                                    authenticated-user policy from 0093 (which drifted to
--                                    RLS-off in prod) and add FORCE.
--
--   The lucia-bypass + NULLIF(current_setting('app.operating_company_id', true), '')::uuid
--   predicate matches the live accounting.invoice_lines / accounting.bills policies.
--   bill_lines/expense_lines isolate through the parent header, mirroring the
--   established child-table precedent in 202606072351_recurring_bills.sql.
--
-- Idempotent: ENABLE/FORCE RLS are no-ops if already set; DROP POLICY IF EXISTS
-- precedes every CREATE POLICY. Safe on empty tables (bill_lines/expense_lines
-- are 0 rows in prod).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Defensive grants (belt-and-suspenders; already granted upstream)
-- ------------------------------------------------------------
GRANT USAGE ON SCHEMA accounting TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.bill_lines TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.expense_lines TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounting.line_category_load_required TO ih35_app;

-- ------------------------------------------------------------
-- 1. accounting.bill_lines — isolate through accounting.bills (parent)
-- ------------------------------------------------------------
ALTER TABLE accounting.bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.bill_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bill_lines_company_isolation ON accounting.bill_lines;
CREATE POLICY bill_lines_company_isolation ON accounting.bill_lines
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR bill_id IN (
      SELECT b.id
      FROM accounting.bills b
      WHERE b.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR bill_id IN (
      SELECT b.id
      FROM accounting.bills b
      WHERE b.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
    )
  );

-- ------------------------------------------------------------
-- 2. accounting.expense_lines — adaptive isolation
--      parent accounting.expenses present -> isolate through it
--      parent absent (prod + CI today)    -> deny-by-default (lucia bypass only)
-- ------------------------------------------------------------
ALTER TABLE accounting.expense_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.expense_lines FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_lines_company_isolation ON accounting.expense_lines;

DO $$
BEGIN
  IF to_regclass('accounting.expenses') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'accounting'
         AND table_name = 'expenses'
         AND column_name = 'operating_company_id'
     )
  THEN
    -- Parent header exists: isolate through accounting.expenses (mirrors bill_lines).
    EXECUTE $pol$
      CREATE POLICY expense_lines_company_isolation ON accounting.expense_lines
        FOR ALL TO ih35_app
        USING (
          identity.is_lucia_bypass()
          OR expense_id IN (
            SELECT e.id
            FROM accounting.expenses e
            WHERE e.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          )
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR expense_id IN (
            SELECT e.id
            FROM accounting.expenses e
            WHERE e.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          )
        )
    $pol$;
  ELSE
    -- No parent header table (current prod + CI state): deny-by-default.
    -- Only the lucia maintenance bypass may touch rows. Table is empty and the
    -- write path is inert without accounting.expenses, so this leaks nothing.
    EXECUTE $pol$
      CREATE POLICY expense_lines_company_isolation ON accounting.expense_lines
        FOR ALL TO ih35_app
        USING (identity.is_lucia_bypass())
        WITH CHECK (identity.is_lucia_bypass())
    $pol$;
  END IF;
END
$$;

-- ------------------------------------------------------------
-- 3. accounting.line_category_load_required — GLOBAL reference table
--    No operating_company_id / no company linkage: OCI isolation is N/A.
--    RLS was enabled in 0093 but is OFF in prod (drift). Restore the original
--    authenticated-user policy and add FORCE so the audit flag is fully cleared.
-- ------------------------------------------------------------
ALTER TABLE accounting.line_category_load_required ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.line_category_load_required FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS line_category_load_required_select ON accounting.line_category_load_required;
CREATE POLICY line_category_load_required_select ON accounting.line_category_load_required
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_id() IS NOT NULL
  );

DROP POLICY IF EXISTS line_category_load_required_write ON accounting.line_category_load_required;
CREATE POLICY line_category_load_required_write ON accounting.line_category_load_required
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR identity.current_user_id() IS NOT NULL
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR identity.current_user_id() IS NOT NULL
  );

COMMIT;
