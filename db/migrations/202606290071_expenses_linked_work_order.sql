-- [HOLD-FOR-JORGE — TIER 1] accounting.expenses.linked_work_order_uuid — WO -> expense linkage column.
--
-- Tier-1 FINANCIAL (accounting.*). ADDITIVE + NULLABLE only. two-section-service.autoCreateExpenseFromWO
-- has been INSERTing linked_work_order_uuid into accounting.expenses even though no migration ever added
-- the column (the WO->expense link existed only in code, mirroring accounting.bills.linked_work_order_uuid
-- which IS migration-backed via 0090/0123). This adds the missing column so:
--   - the auto-created WO expense actually persists its WO link (Fix C), and
--   - WO void/cancel can find + reverse a posted linked expense instead of orphaning it.
--
-- Nullable, no backfill, no FK (mirrors the bills convention — soft link, no hard cascade). Idempotent.
-- Existing accounting.expenses RLS (operating_company_id tenant scope, migration 202606151300) already
-- covers this table; no new policy/grant needed.
BEGIN;

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS linked_work_order_uuid uuid;

CREATE INDEX IF NOT EXISTS idx_expenses_linked_work_order_uuid
  ON accounting.expenses (linked_work_order_uuid)
  WHERE linked_work_order_uuid IS NOT NULL;

COMMIT;
