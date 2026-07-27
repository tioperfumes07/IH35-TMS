-- [HOLD-FOR-JORGE — TIER 1] MNT-LINK-03b — work_orders.source_intransit_issue_id reverse FK.
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Root cause: convert-to-WO sets dispatch.intransit_issues.promoted_to_wo_id (forward) but WO has no
-- first-class back-ref — reverse is reconstructable only by query (§10.3 both-way).
-- Canonical (Neon lucia): dispatch.intransit_issues(id) — NOT phantom in_transit_issues / NOT RETIRE.
-- Cursor band 20260910xxxx. Idempotent. Inline REFERENCES required (orphan-fk ratchet).

BEGIN;

DO $$
DECLARE
  v_dangling bigint;
BEGIN
  IF to_regclass('maintenance.work_orders') IS NULL THEN
    RAISE NOTICE 'MNT-LINK-03b: maintenance.work_orders absent — skip';
    RETURN;
  END IF;
  IF to_regclass('dispatch.intransit_issues') IS NULL THEN
    RAISE NOTICE 'MNT-LINK-03b: dispatch.intransit_issues absent — skip';
    RETURN;
  END IF;

  -- Prefer inline REFERENCES on ADD COLUMN (orphan-fk inventory ratchet).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'maintenance'
      AND table_name = 'work_orders'
      AND column_name = 'source_intransit_issue_id'
  ) THEN
    ALTER TABLE maintenance.work_orders
      ADD COLUMN source_intransit_issue_id uuid
        REFERENCES dispatch.intransit_issues(id) ON DELETE SET NULL;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'work_orders_source_intransit_issue_id_fkey'
      AND conrelid = 'maintenance.work_orders'::regclass
  ) THEN
    -- Column exists without FK (partial apply) — attach constraint after dangling prove.
    SELECT COUNT(*) INTO v_dangling
    FROM maintenance.work_orders wo
    WHERE wo.source_intransit_issue_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM dispatch.intransit_issues i WHERE i.id = wo.source_intransit_issue_id
      );
    IF v_dangling > 0 THEN
      RAISE EXCEPTION 'MNT-LINK-03b ABORT: % dangling work_orders.source_intransit_issue_id row(s)', v_dangling;
    END IF;
    ALTER TABLE maintenance.work_orders
      ADD CONSTRAINT work_orders_source_intransit_issue_id_fkey
      FOREIGN KEY (source_intransit_issue_id)
      REFERENCES dispatch.intransit_issues(id)
      ON DELETE SET NULL;
  ELSE
    RAISE NOTICE 'MNT-LINK-03b: source_intransit_issue_id FK already present — skip';
  END IF;

  -- Backfill from forward link (promoted_to_wo_id).
  UPDATE maintenance.work_orders wo
     SET source_intransit_issue_id = i.id
    FROM dispatch.intransit_issues i
   WHERE i.promoted_to_wo_id = wo.id
     AND wo.source_intransit_issue_id IS NULL;

  CREATE INDEX IF NOT EXISTS idx_work_orders_source_intransit_issue
    ON maintenance.work_orders (source_intransit_issue_id)
    WHERE source_intransit_issue_id IS NOT NULL;
END
$$;

COMMIT;
