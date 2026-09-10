-- CLAIM-RESERVE 202614042200 (merged #21712).
--
-- LOCK-THE-TRUCKS DB BACKSTOP (owner order 2026-09-10, verbatim: "the important thing right now is
-- to lock the trucks ... once a truck is dispatched on a load it can't be silently reassigned or
-- double-booked").
--
-- WHAT THIS MIGRATION DOES: adds ONE partial unique index to mdata.loads:
--   uq_loads_one_active_unit ON (assigned_unit_id)
--   WHERE assigned_unit_id IS NOT NULL AND soft_deleted_at IS NULL
--     AND status = ANY(ACTIVE_UNIT_STATUSES).
-- It makes it IMPOSSIBLE for one truck (assigned_unit_id) to be on two simultaneously-active loads.
--
-- WHY: NEW-02 (owner urgent live report 2026-09-07) found unit T152 double-dispatched — loads 13572
-- and 13575 both 'dispatched' on the same assigned_unit_id. The root cause was that none of the five
-- write paths that set mdata.loads.assigned_unit_id checked whether the incoming unit was already
-- active on a DIFFERENT load. The application-level fix — assertUnitNotActiveOnAnotherLoad in
-- apps/backend/src/dispatch/unit-active-load-guard.ts — is already live and wired into ALL five
-- (book-load create, quick-assign, quicksave reassign, the generic load-edit PATCH, and the office
-- loads.routes.ts PATCH). That NEW-02 comment states, verbatim: "The permanent DB-level backstop (a
-- partial unique index on assigned_unit_id WHERE status IN (...active...) AND soft_deleted_at IS NULL)
-- is a migration and must be authored by a migration-authorized lane ... handed off separately." THIS
-- migration is that handed-off backstop: defense-in-depth so a truck physically cannot be
-- double-dispatched even if a future write path forgets to call the app-level check.
--
-- ACTIVE_UNIT_STATUSES mirrors unit-active-load-guard.ts EXACTLY — the "truck is physically out with
-- this load" set. It deliberately EXCLUDES delivered_pending_docs / completed_docs_received (delivery
-- has happened, the unit is free; a truck legitimately carries a backlog of many loads sitting in
-- those statuses waiting on paperwork) and every draft/terminal/cancelled status. Keep this list in
-- lockstep with ACTIVE_UNIT_STATUSES if that ever changes.
--
-- SAFE TO BUILD: live-verified 0 current active-status duplicate assigned_unit_id on prod (USMCA,
-- bypass_rls=lucia) before authoring — the index build cannot fail against live data. REHEARSED on a
-- throwaway Neon branch (br-bitter-cake-akkjlzdf, off br-fancy-credit-akjnd07a): the index REJECTS a
-- second active load on the same unit (duplicate key value violates unique constraint
-- "uq_loads_one_active_unit"), ALLOWS a legitimate swap of a dispatched load to a currently-free unit,
-- and ALLOWS two loads on the same unit in delivered_pending_docs (the paperwork backlog).
--
-- IDEMPOTENT / FRESH-DB SAFE: CREATE UNIQUE INDEX IF NOT EXISTS, guarded by to_regclass so a fresh CI
-- DB before mdata.loads exists is a clean no-op. Non-concurrent (a CONCURRENTLY build cannot run
-- inside the transaction-wrapped migration runner), matching this repo's existing index-creation
-- pattern (see 202613910000_settlement_lines_no_duplicate_lines.sql). CREATE-only, never DROP.
-- NO RLS/GRANT CHANGE: an index carries no RLS/GRANT surface of its own.

DO $$
BEGIN
  IF to_regclass('mdata.loads') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_loads_one_active_unit
      ON mdata.loads (assigned_unit_id)
      WHERE assigned_unit_id IS NOT NULL
        AND soft_deleted_at IS NULL
        AND status = ANY(ARRAY[
          'assigned',
          'assigned_not_dispatched',
          'dispatched',
          'at_pickup',
          'in_transit',
          'at_delivery'
        ]::mdata.load_status_enum[]);
  END IF;
END $$;
