-- 202614390000_expense_lines_fleet_linkage.sql
-- RENAMED from 202614360000 (2026-09-25): that timestamp collided with an already-merged sibling,
-- 202614360000_factoring_posting_key_revision.sql -- two files claiming the same 12-digit slot,
-- discovered when rebasing onto origin/claude/r186-creator-je-preview-paritytable. This file was
-- already live-applied to prod under its old name/checksum; the live ledger rows
-- (_system._schema_migrations, ih35_migrations.applied_migrations) are updated in the same pass to
-- the new filename/checksum so the on-disk file and the applied-migration record stay in sync.
--
-- ROUND 172 step 3 (Lead order, check-engine full QBO Write Check parity). QBO Write Check's category
-- grid needs per-LINE Driver/Truck(unit)/Trailer/Work order columns (spec step 3), not just the
-- per-line load_id this table already has -- e.g. one check paying a repair invoice that covers two
-- different trucks needs each line tagged to its own truck, not one truck for the whole check.
--
-- Live-verified gap (2026-09-25, information_schema + pg_constraint on br-fancy-credit-akjnd07a):
-- accounting.expense_lines has load_id (expense_lines_load_id_fkey) but NO driver_id/unit_id/
-- trailer_id/linked_work_order_uuid -- those three dimensions exist only on the accounting.expenses
-- HEADER (driver_uuid/unit_id/trailer_id/linked_work_order_uuid). This exact shape of gap (a linkage
-- dimension present on one document/line table but missing on a sibling) was already closed once this
-- way for accounting.bills in 202613360001_go18_bill_driver_trailer_load_required.sql ("accounting.bills
-- has unit_id but NO driver_id/trailer_id... expense_lines has load_id but NO load_required/
-- load_exemption_reason/line_category" -- same additive-column, same-shape fix). This migration is the
-- same fix applied to accounting.expense_lines' own missing three columns, mirroring the exact FK
-- targets and ON DELETE behavior already used on accounting.expenses' header columns:
--   expenses_driver_uuid_fkey             -> mdata.drivers(id)                          [no ON DELETE clause]
--   expenses_unit_id_fkey                 -> mdata.units(id)   ON DELETE SET NULL
--   expenses_trailer_id_fkey              -> mdata.equipment(id) ON DELETE SET NULL
--   expenses_linked_work_order_uuid_fkey  -> maintenance.work_orders(id) ON DELETE SET NULL
--
-- Additive only, all nullable, no backfill, no default beyond NULL ("not linked" for every existing
-- row, matching load_id's own original nullable rollout on this same table).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'expense_lines' AND column_name = 'driver_id'
  ) THEN
    ALTER TABLE accounting.expense_lines ADD COLUMN driver_id uuid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'expense_lines' AND column_name = 'unit_id'
  ) THEN
    ALTER TABLE accounting.expense_lines ADD COLUMN unit_id uuid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'expense_lines' AND column_name = 'trailer_id'
  ) THEN
    ALTER TABLE accounting.expense_lines ADD COLUMN trailer_id uuid;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'expense_lines' AND column_name = 'linked_work_order_uuid'
  ) THEN
    ALTER TABLE accounting.expense_lines ADD COLUMN linked_work_order_uuid uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_driver_id_fkey') THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_unit_id_fkey') THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES mdata.units(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_trailer_id_fkey') THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_trailer_id_fkey FOREIGN KEY (trailer_id) REFERENCES mdata.equipment(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_linked_work_order_uuid_fkey') THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_linked_work_order_uuid_fkey FOREIGN KEY (linked_work_order_uuid) REFERENCES maintenance.work_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expense_lines_driver_id ON accounting.expense_lines (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_lines_unit_id ON accounting.expense_lines (unit_id) WHERE unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_lines_trailer_id ON accounting.expense_lines (trailer_id) WHERE trailer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_lines_linked_work_order_uuid ON accounting.expense_lines (linked_work_order_uuid) WHERE linked_work_order_uuid IS NOT NULL;
