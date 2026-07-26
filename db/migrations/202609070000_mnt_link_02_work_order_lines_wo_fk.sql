-- [HOLD-FOR-JORGE — TIER 1] MNT-LINK-02 — work_order_lines → work_orders FK (island close).
--
-- *** DO NOT MERGE WITHOUT JORGE'S EXPLICIT OK. DO NOT RUN ON PROD. ***
-- Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill.
--
-- PROD TRUTH (FOR-CURSOR 4): maintenance.work_order_lines.work_order_uuid is NOT NULL but has
-- NO FK to maintenance.work_orders — only a self-ref parent_line_uuid. Application code treats
-- work_order_uuid as maintenance.work_orders.id (work-orders.routes.ts).
--
-- FIX: ADD CONSTRAINT fk_work_order_lines_work_order
--   work_order_lines.work_order_uuid → maintenance.work_orders(id)
-- Pattern: NOT VALID → orphan ABORT → VALIDATE. Idempotent / fresh-DB-safe / void-not-delete.
-- No GL math. No feature flag. FORCE RLS unchanged (already isolate-through-parent).

BEGIN;

DO $$
DECLARE
  v_lines regclass := to_regclass('maintenance.work_order_lines');
  v_orders regclass := to_regclass('maintenance.work_orders');
  v_orphans bigint;
BEGIN
  IF v_lines IS NULL OR v_orders IS NULL THEN
    RAISE NOTICE 'MNT-LINK-02: work_order_lines or work_orders absent — skipping (clean no-op)';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_work_order_lines_work_order'
      AND conrelid = v_lines
  ) THEN
    RAISE NOTICE 'MNT-LINK-02: fk_work_order_lines_work_order already present — skip';
    RETURN;
  END IF;

  -- Abort loudly if any line points at a missing WO (would leave NOT VALID forever / hide data loss).
  SELECT COUNT(*)::bigint
    INTO v_orphans
  FROM maintenance.work_order_lines wol
  WHERE NOT EXISTS (
    SELECT 1 FROM maintenance.work_orders wo WHERE wo.id = wol.work_order_uuid
  );

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'MNT-LINK-02 ABORT: % orphan work_order_lines row(s) with work_order_uuid not in maintenance.work_orders — repair data before applying FK',
      v_orphans;
  END IF;

  ALTER TABLE maintenance.work_order_lines
    ADD CONSTRAINT fk_work_order_lines_work_order
    FOREIGN KEY (work_order_uuid)
    REFERENCES maintenance.work_orders(id)
    NOT VALID;

  ALTER TABLE maintenance.work_order_lines
    VALIDATE CONSTRAINT fk_work_order_lines_work_order;

  RAISE NOTICE 'MNT-LINK-02: fk_work_order_lines_work_order added + validated (0 orphans)';
END
$$;

COMMIT;
