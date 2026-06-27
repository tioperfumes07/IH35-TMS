-- INV-1 — Add soft_deleted_at to mdata.load_stops (void-never-delete invariant).
--
-- Audit finding (2026-06-27): dispatch-refinements.service.ts:241 and
-- mdata/loads.routes.ts:1231 issue hard DELETE on mdata.load_stops. Under Chapter 11,
-- load_stops are POD/stop evidence that must never be physically deleted.
--
-- Fix: add soft_deleted_at column + an index; the application code is updated in the
-- same PR to:
--   1. replaceLoadStopsRefined → UPDATE SET soft_deleted_at = now() instead of DELETE
--   2. DELETE /mdata/loads/:id/stops/:stopId → UPDATE SET soft_deleted_at = now()
-- All read queries already filter on status; they are updated to also exclude
-- soft_deleted_at IS NOT NULL rows where needed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

BEGIN;

ALTER TABLE mdata.load_stops
  ADD COLUMN IF NOT EXISTS soft_deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_load_stops_soft_deleted
  ON mdata.load_stops (load_id, soft_deleted_at)
  WHERE soft_deleted_at IS NULL;

COMMIT;
