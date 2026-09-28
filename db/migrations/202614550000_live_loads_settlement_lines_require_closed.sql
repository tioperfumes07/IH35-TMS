-- ROUND 206 (Lead order, 2026-09-28, docs/bus/2026-09-28-LEAD-RULING-CC3-DISPATCH-ACTIVE-LOADS-LANE-CROSS.md):
-- P0 dispatcher-visibility defect -- the Dispatch board's ACTIVE LOADS tile and Kanban showed 2
-- loads while ROUND-TRIP EXPOSURE correctly showed 14 more, all sixteen reading the same
-- mdata.loads rows. views.live_loads (202614180000_views_live_loads.sql) excludes a load from its
-- open_dispatch bucket the moment ANY driver_finance.settlement_lines row with is_active = true
-- exists for it -- the view's own comment states the intent: "a settlement ... ends a round trip"
-- -- but it never checks whether that settlement is actually CLOSED. Fourteen of the sixteen live
-- USMCA loads (13624, 13627-13639 excluding 13633/13634) carry real, dollar-valued earnings/
-- deadhead_pay settlement_lines rows -- all created 2026-09-28T05:00:00Z in one batch -- attached
-- to their pre-settlements while those settlements are still status='open', locked_at IS NULL.
-- An open settlement has not ended anything; the round trip is still in progress. This is the same
-- "legacy mirror column a guard treats as canonical" defect class already found today on
-- driver_finance.driver_bills.settled_in_settlement_id (ROUND 191 item 1) -- here the mirror is a
-- settlement_line's mere existence standing in for "the round trip is done."
--
-- THE FIX: settlement_lines only counts as ending a round trip when its PARENT settlement is
-- actually closed (driver_finance.driver_settlements.status = 'closed', the canonical closed
-- marker per 202606120100_c1_pre_settlements.sql's own CHECK). No load status is changed, no
-- settlement_lines row is voided or altered -- this changes only which rows survive the view's own
-- predicate. The driver_bills.settled_in_settlement_id half of the same WHERE clause is untouched
-- (live-confirmed none of the 14 affected loads have a settled driver bill -- that half is not the
-- bug here).
--
-- Idempotent: CREATE OR REPLACE VIEW, same pattern as 202614180000's own migration. Safe to re-run.
BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL
     AND to_regclass('driver_finance.settlement_lines') IS NOT NULL
     AND to_regclass('driver_finance.driver_settlements') IS NOT NULL
     AND to_regclass('driver_finance.driver_bills') IS NOT NULL
     AND to_regclass('accounting.invoices') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.live_loads
      WITH (security_invoker = true) AS
      SELECT
        l.*,
        CASE
          WHEN l.status::text IN ('delivered', 'delivered_pending_docs', 'completed_docs_received')
            THEN 'pre_settlement'
          ELSE 'open_dispatch'
        END AS live_state
      FROM mdata.loads l
      WHERE l.is_sample_data IS NOT TRUE
        AND l.soft_deleted_at IS NULL
        -- (1) the status half -- excludes draft (never dispatched), the three financially-closed
        -- statuses, and the four exception-terminal statuses.
        AND l.status::text NOT IN (
              'draft', 'invoiced', 'paid', 'closed', 'cancelled',
              'abandoned', 'driver_walkoff', 'driver_no_show')
        -- (2) the DRIVER-side money half -- a CLOSED settlement or a SETTLED driver bill ends a
        -- round trip in EITHER live_state bucket. ROUND 206 fix: a settlement_lines row on a
        -- still-OPEN settlement does NOT end a round trip -- only a row belonging to a settlement
        -- whose own status is 'closed' does.
        AND NOT EXISTS (
          SELECT 1
            FROM driver_finance.settlement_lines s
            JOIN driver_finance.driver_settlements ds ON ds.id = s.settlement_id
           WHERE s.load_id = l.id
             AND s.is_active IS TRUE
             AND ds.status = 'closed'
        )
        AND NOT EXISTS (
          SELECT 1 FROM driver_finance.driver_bills b
           WHERE b.load_id = l.id AND b.settled_in_settlement_id IS NOT NULL
        )
        -- (3) the REVENUE-side money half -- an issued invoice only excludes a load from the
        -- open_dispatch bucket. It must NEVER exclude a load from pre_settlement -- a delivered,
        -- invoiced, not-yet-settled load IS the definition of pre-settlement.
        AND (
          l.status::text IN ('delivered', 'delivered_pending_docs', 'completed_docs_received')
          OR NOT EXISTS (
            SELECT 1 FROM accounting.invoices i
             WHERE i.source_load_id = l.id
               AND i.status NOT IN ('draft', 'proforma', 'void')
          )
        )
    $VIEW$;

    GRANT SELECT ON views.live_loads TO ih35_app;
  END IF;
END
$$;

COMMIT;
