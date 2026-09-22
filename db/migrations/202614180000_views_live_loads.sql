-- ROUND 36.1 (Lead ruling, 2026-09-22, docs/manuals/02-RULING-LIVE-LOADS-VIEW-THE-PERMANENT-FIX.md):
-- views.live_loads -- THE PERMANENT, STRUCTURAL FIX for "At Risk shows 19."
--
-- WHY: assertCanonicalSubset (apps/backend/src/dispatch/canonical-active-load-set.ts) can only
-- validate that a board's STATUS LIST is a subset of the canonical status set. It cannot enforce
-- the other half of "is this load active" -- a set of NOT EXISTS conditions against three other
-- tables (driver_finance.settlement_lines, driver_finance.driver_bills, accounting.invoices). A
-- list-based guard can never enforce a row-level condition. So every board that imported
-- assertCanonicalSubset, passed it, and still rendered every 'dispatched' load -- 19, of which 14
-- were already settled and driver-billed -- was individually correct against the guard and
-- collectively wrong against the data. A per-caller convention is what failed: every board has to
-- remember to apply the money half, and thirteen callers did not.
--
-- THE FIX: move the guarantee into the data layer, where it cannot be skipped. Settled loads are
-- not in this view. A board physically cannot render one -- including boards nobody has written
-- yet. `views` is the established pattern (39 objects already, including
-- views.dispatch_load_with_driver_status + views.units_with_dispatch_status).
--
-- CORRECTION (2026-09-22, same day, folded into this migration's first landing rather than a
-- follow-up -- the original predicate below was applied directly to Neon and then found wrong
-- before a migration file ever reached main; this file carries the CORRECTED SQL from the start
-- so the repo and the database never disagree): the INVOICE test must not gate the whole view.
-- An invoice is the REVENUE side; a settlement is the DRIVER side. A round trip ends at
-- SETTLEMENT, not at invoice. Owner, verbatim, about four exact loads once invoiced but not yet
-- settled: "these are delivered and invoiced, not settled because the roundtrip is not complete."
-- The original predicate excluded a load the moment it had ANY issued invoice, which measured
-- live emptied the pre_settlement bucket the moment those four invoices were sent (pre_settlement
-- 4 -> 0) while the round trips were still genuinely open. CORRECTED: the invoice test now only
-- gates open_dispatch (an invoiced load is no longer "dispatching"); the driver-bill test is
-- tightened to require settled_in_settlement_id IS NOT NULL (a driver bill merely EXISTING does
-- not end a round trip -- one that is SETTLED does).
--
-- VALIDATED LIVE (USMCA, set_config('app.bypass_rls','lucia',true), 2026-09-22, AFTER the four
-- pre-settlement invoices were sent -- the real test of the predicate):
--   live_state       loads  load numbers
--   open_dispatch        5  13609, 13615, 13616, 13617, 13618
--   pre_settlement       4  13610, 13612, 13613, 13614
-- The owner's own 5 open loads and his 4 delivered-and-invoiced-not-yet-settled loads, exactly --
-- stable against an invoice being sent, which the uncorrected predicate was not.
--
-- RLS: WITH (security_invoker = true) so the view inherits mdata.loads' own FORCED-RLS policies
-- through the calling role/session GUCs, rather than running as the view owner. A view that
-- bypasses RLS is a worse defect than the one it fixes -- confirmed live: as the real runtime
-- role ih35_app (rolbypassrls=false, NOT neondb_owner which has rolbypassrls=true and would mask
-- a real gap), an unscoped query against this view returns 0 rows; scoped, it returns the correct
-- rows. Same pattern already used by views.dispatch_load_with_driver_status's sibling views
-- (0048_p3_t11_5_1_dispatch_gates.sql).
--
-- Idempotent: CREATE OR REPLACE VIEW: safe to re-run.
BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL
     AND to_regclass('driver_finance.settlement_lines') IS NOT NULL
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
        -- (2) the DRIVER-side money half -- a settlement or a SETTLED driver bill ends a round
        -- trip in EITHER live_state bucket.
        AND NOT EXISTS (
          SELECT 1 FROM driver_finance.settlement_lines s
           WHERE s.load_id = l.id AND s.is_active IS TRUE
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
