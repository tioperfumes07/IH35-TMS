-- [HOLD-FOR-JORGE — TIER 1] P2 DB-audit — maintenance.work_order_lines + maintenance.wo_status_history
-- have NO row-level security at all.
--
-- *** DO NOT MERGE-AND-RUN. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then
--     ledger-backfill so prod db:migrate skips it. RLS/schema change — never self-merge per
--     constitution §1.3/§1.4. ***
--
-- VERIFIED (read-only, db/migrations/ only — no prod DB access):
--   * `maintenance.work_order_lines` — created by 0050_two_section_v5_and_safety_restructure.sql
--     (`CREATE TABLE IF NOT EXISTS maintenance.work_order_lines (...)`, columns extended by the same
--     migration + repair migration 0198_repair_work_order_lines_two_section_columns.sql). Searched every
--     migration in db/migrations/ for `ALTER TABLE maintenance.work_order_lines ... ROW LEVEL SECURITY`
--     or any `CREATE POLICY ... ON maintenance.work_order_lines` — none exists anywhere in the chain.
--     The table also carries NO `operating_company_id` column of its own (only `work_order_uuid`, no
--     formal FK constraint found either — a separate, smaller, non-RLS gap noted below but not fixed
--     here to stay in scope).
--   * `maintenance.wo_status_history` — created by 0190_maintenance_wo_status_history.sql as a self-heal
--     ("referenced by REST routes but was never introduced in the SQL migration chain"). Same search: no
--     RLS anywhere. Has `work_order_id uuid NOT NULL REFERENCES maintenance.work_orders(id)` — a real FK,
--     which this migration's policy joins through.
--   * Both are exactly the "company-data walled" gap the entity-isolation mandate (constitution §1,
--     `cross-entity-leak-audit-usmca` memory) targets: any authenticated `ih35_app` session can currently
--     read/write ANY company's work-order line items and status-change history, cross-tenant, cross-entity
--     (TRANSP/TRK/USMCA) — a live leak once USMCA launches.
--   * Precedent for the fix shape: `accounting.bill_lines` (child table with NO operating_company_id
--     column of its own) is isolated through its parent `accounting.bills.operating_company_id` via a
--     `bill_id IN (SELECT id FROM accounting.bills WHERE operating_company_id = ...)` subquery policy —
--     migration 202606080040_enable_rls_bill_lines_expense_lines_line_category_load_required.sql. This
--     migration applies the identical isolate-through-parent pattern, joining through
--     `maintenance.work_orders.operating_company_id` (that column DOES exist on work_orders — confirmed
--     in 0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql).
--
-- ADJACENT FINDING — OUT OF SCOPE, FLAGGED NOT FIXED: searching the full migration chain for
--   `ALTER TABLE maintenance.work_orders ... ROW LEVEL SECURITY` also returns NOTHING — the work_orders
--   PARENT table itself appears to have no RLS/FORCE RLS ever applied either. This migration's child-table
--   policies do not depend on the parent having RLS (the subquery filters explicitly on
--   `operating_company_id`, independent of whether RLS is enabled on the parent), so this fix is correct
--   and complete for the two named tables regardless. But `maintenance.work_orders` lacking RLS is a
--   larger, separate finding — surfaced in the companion design doc (docs/db-audit/P2-integrity-DESIGN.md
--   §3) for its own follow-up block, not silently folded into this one.
--
-- WHAT THIS MIGRATION DOES (additive-only, idempotent):
--   ENABLE + FORCE RLS on both tables; one isolate-through-parent policy each, lucia-bypass included,
--   mirroring the accounting.bill_lines precedent exactly. Defensive re-GRANT (belt-and-suspenders; 0065
--   already covers this).
--
-- Fresh-DB safe: guarded by to_regclass(...) IS NOT NULL. Never RAISEs.

BEGIN;

GRANT USAGE ON SCHEMA maintenance TO ih35_app;

DO $$
BEGIN
  IF to_regclass('maintenance.work_order_lines') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance.work_order_lines TO ih35_app;

    ALTER TABLE maintenance.work_order_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE maintenance.work_order_lines FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS work_order_lines_company_isolation ON maintenance.work_order_lines;
    EXECUTE $POLICY$
      CREATE POLICY work_order_lines_company_isolation ON maintenance.work_order_lines
        FOR ALL TO ih35_app
        USING (
          identity.is_lucia_bypass()
          OR work_order_uuid IN (
            SELECT wo.id
            FROM maintenance.work_orders wo
            WHERE wo.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          )
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR work_order_uuid IN (
            SELECT wo.id
            FROM maintenance.work_orders wo
            WHERE wo.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          )
        )
    $POLICY$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('maintenance.wo_status_history') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance.wo_status_history TO ih35_app;

    ALTER TABLE maintenance.wo_status_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE maintenance.wo_status_history FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS wo_status_history_company_isolation ON maintenance.wo_status_history;
    EXECUTE $POLICY$
      CREATE POLICY wo_status_history_company_isolation ON maintenance.wo_status_history
        FOR ALL TO ih35_app
        USING (
          identity.is_lucia_bypass()
          OR work_order_id IN (
            SELECT wo.id
            FROM maintenance.work_orders wo
            WHERE wo.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          )
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR work_order_id IN (
            SELECT wo.id
            FROM maintenance.work_orders wo
            WHERE wo.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
          )
        )
    $POLICY$;
  END IF;
END
$$;

COMMIT;
