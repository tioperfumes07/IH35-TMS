-- DISP-F02 — restore views.units_with_dispatch_status, which has been a DEAD STUB in production.
--
-- WHAT WENT WRONG. Migration 0048 defines this view inside a DO block with two branches: the real
-- definition when BOTH mdata.units and maintenance.work_orders exist, and an $EMPTY$ fallback
-- (SELECT NULL::uuid ... WHERE false) otherwise. On this database the ELSE branch fired, so the view
-- has always returned ZERO rows for every unit. Verified on the prod branch 2026-08-02 via
-- pg_get_viewdef: "SELECT NULL::uuid AS id, ... false AS is_dispatch_blocked, ... WHERE false;".
--
-- CONSEQUENCE. Four dispatch paths joined this view. DISP-F01 (#3999) made the OOS block independent
-- of it — that gate is live now — but the two gates the view alone feeds are STILL DISABLED:
--   WF-050  is_dispatch_blocked / dispatch_block_reason / dispatch_block_source_type (DVIR-MAJOR)
--   WF-044  has_open_pm_due_wo / open_wo_count (PM-DUE)
-- Both resolve to false/0 for every unit while the stub stands. This migration re-arms them.
--
-- ADDITIVE AND IDEMPOTENT. CREATE OR REPLACE VIEW with the SAME column list in the SAME order as the
-- 0048 definition, so the replace is legal (Postgres permits appending columns only, never
-- reordering or retyping). security_invoker = true is preserved, so RLS on mdata.units and
-- maintenance.work_orders continues to apply to the CALLER, not to the view owner. No table is
-- created, altered, dropped or backfilled; no row is written.
--
-- ONE DELIBERATE CORRECTION to the 0048 definition, not a blind restore: the work-order subqueries
-- now exclude voided rows. maintenance.work_orders.voided_at exists on prod, and this repo is
-- void-not-delete — a VOIDED PM work order is not an open obligation, and counting it would block
-- dispatch on a work order somebody explicitly voided. Restoring 0048 verbatim would have re-armed
-- the gate with that bug baked in.
--
-- ENTITY SCOPING. operating_company_id is COALESCE(currently_leased_to_company_id, owner_company_id),
-- exactly as 0048 had it. mdata.units carries no operating_company_id of its own, and the 13
-- out-of-service units on prod are TRK-owned and leased to TRANSP — a lease-blind view would hide
-- precisely the population these gates exist to catch.
DO $$
BEGIN
  IF to_regclass('mdata.units') IS NULL OR to_regclass('maintenance.work_orders') IS NULL THEN
    RAISE EXCEPTION
      'DISP-F02: mdata.units and maintenance.work_orders must both exist before restoring views.units_with_dispatch_status. Refusing to re-create the empty stub — a silently empty safety view is the defect this migration removes.';
  END IF;

  EXECUTE $VIEW$
    CREATE OR REPLACE VIEW views.units_with_dispatch_status
    WITH (security_invoker = true) AS
    SELECT
      u.id,
      COALESCE(u.unit_number, u.id::text) AS display_id,
      COALESCE(u.currently_leased_to_company_id, u.owner_company_id) AS operating_company_id,
      u.is_dispatch_blocked,
      u.dispatch_block_reason,
      u.dispatch_block_source_type,
      EXISTS (
        SELECT 1
        FROM maintenance.work_orders wo
        WHERE wo.unit_id = u.id
          AND wo.status IN ('open', 'in_progress', 'waiting_parts')
          AND wo.wo_type = 'pm'
          AND wo.voided_at IS NULL
      ) AS has_open_pm_due_wo,
      (
        SELECT COUNT(*)::int
        FROM maintenance.work_orders wo
        WHERE wo.unit_id = u.id
          AND wo.status IN ('open', 'in_progress', 'waiting_parts')
          AND wo.voided_at IS NULL
      ) AS open_wo_count
    FROM mdata.units u
    WHERE u.deactivated_at IS NULL
  $VIEW$;
END
$$;

GRANT SELECT ON views.units_with_dispatch_status TO ih35_app;
