-- MAINT-MONEY-F6797-WO-LINE-DELETE-DESTROYS-COST-HISTORY
--
-- FINDING: DELETE /api/v1/maintenance/work-orders/:id/line-items/:lid physically removes a
-- maintenance.work_order_lines row before AP posting. The table has no void/archive columns today
-- (verified: CREATE TABLE in 0050_two_section_v5_and_safety_restructure.sql carries none), and
-- every cost/AP-total reader currently aggregates ALL rows for a work_order_uuid — so a
-- route-only "stop deleting" patch would be theater; the void state has nowhere to live and no
-- reader could exclude a voided line even if one existed.
--
-- FIX (this migration is scaffolding only — the route conversion and reader updates ship in the
-- same PR, in application code, not here): add append-only void metadata so a removed cost line
-- becomes a reversible, audited state transition instead of a hard DELETE. Idempotent
-- (ADD COLUMN IF NOT EXISTS). No data migration needed — every existing row is implicitly
-- "not voided" (voided_at IS NULL), which is the correct default for history that already exists.

BEGIN;

ALTER TABLE maintenance.work_order_lines
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity.users(id);

-- A line already voided cannot be voided again — the route's own compare-and-set
-- (WHERE voided_at IS NULL) is the real enforcement; this index makes the common "active lines for
-- a WO" scan (every cost/AP reader added in this PR) cheap.
CREATE INDEX IF NOT EXISTS idx_wo_lines_active
  ON maintenance.work_order_lines (work_order_uuid)
  WHERE voided_at IS NULL;

COMMIT;
