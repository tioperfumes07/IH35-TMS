-- ROUND 285 board-agree follow-through (Cursor, 2026-09-30) — Lead #23294 fixed
-- canonicalActiveLoadNotFinishedByMoneyCte's driver_bills half to require
-- driver_settlements.status = 'closed', but views.live_loads still excluded a load the moment
-- driver_bills.settled_in_settlement_id IS NOT NULL (ROUND 206 left that half untouched).
--
-- LIVE: loads 13633 / 13634 (unit T152) are status='dispatched', bills status='open', both
-- attached to an OPEN settlement (pointer only). The view hid them from List / Trip Pairing /
-- board_scope=live while the TS canonical set correctly kept them. verify-load-boards-agree FAIL.
--
-- THE FIX: mirror the TS join — a driver bill ends a round trip only when its parent settlement
-- is CLOSED. DROP + CREATE (same reason as 202614550000 — CREATE OR REPLACE refuses column
-- reorder when mdata.loads gains columns). Additive predicate only; no load/bill/settlement
-- row changes. Idempotent via IF EXISTS. Safe to re-run.
BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL
     AND to_regclass('driver_finance.settlement_lines') IS NOT NULL
     AND to_regclass('driver_finance.driver_settlements') IS NOT NULL
     AND to_regclass('driver_finance.driver_bills') IS NOT NULL
     AND to_regclass('accounting.invoices') IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS views.live_loads';
    EXECUTE $VIEW$
      CREATE VIEW views.live_loads
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
        AND l.status::text NOT IN (
              'draft', 'invoiced', 'paid', 'closed', 'cancelled',
              'abandoned', 'driver_walkoff', 'driver_no_show')
        AND NOT EXISTS (
          SELECT 1
            FROM driver_finance.settlement_lines s
            JOIN driver_finance.driver_settlements ds ON ds.id = s.settlement_id
           WHERE s.load_id = l.id
             AND s.is_active IS TRUE
             AND ds.status = 'closed'
        )
        -- ROUND 285: bill attachment alone is NOT finished — settlement must be closed
        -- (matches apps/backend/src/dispatch/canonical-active-load-set.ts).
        AND NOT EXISTS (
          SELECT 1
            FROM driver_finance.driver_bills b
            JOIN driver_finance.driver_settlements ds2 ON ds2.id = b.settled_in_settlement_id
             AND ds2.status = 'closed'
           WHERE b.load_id = l.id
             AND b.status <> 'void'
        )
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
