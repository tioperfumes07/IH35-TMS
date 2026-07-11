-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- P2-BILLLINE-LOADID (item 04) — per-load cost attribution on bill lines.
-- GUARD-verified vs live prod (2026-07-11): accounting.bill_lines has bill_id but NO load_id, while
-- accounting.expense_lines HAS load_id (migration 0093) — so bills cannot attribute cost per load the way
-- expenses can. This adds load_id additively, mirroring expense_lines.load_id: nullable, FK -> the
-- canonical hub mdata.loads(id) (NOT a RETIRE table), with a partial index. No backfill (a load link is
-- not derivable for existing rows without fabricating — populated going forward by load-carrying bill
-- flows). FORCED RLS + existing grants on accounting.bill_lines are unchanged (a new column inherits them).
-- Idempotent; additive-only. Tier-1 (financial schema) — build-and-hold, owner ceremony.

BEGIN;

ALTER TABLE accounting.bill_lines
  ADD COLUMN IF NOT EXISTS load_id uuid REFERENCES mdata.loads(id);

CREATE INDEX IF NOT EXISTS idx_bill_lines_load
  ON accounting.bill_lines (load_id)
  WHERE load_id IS NOT NULL;

COMMIT;
