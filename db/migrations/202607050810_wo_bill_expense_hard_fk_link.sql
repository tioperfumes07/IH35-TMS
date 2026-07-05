-- [HOLD-FOR-JORGE — TIER 1] WO ↔ Bill/Expense HARD cross-module link (Jorge's cross-module-linkage rule).
--
-- CONTEXT / DRIFT NOTE (read before merging):
-- accounting.bills.linked_work_order_uuid (migrations 0090/0123) and
-- accounting.expenses.linked_work_order_uuid (migration 202606290071) ALREADY EXIST as the CANONICAL
-- WO→bill/expense link columns. They are actively written by the WO-close posting path
-- (two-section-service.autoCreateBillFromWO / autoCreateExpenseFromWO, wo-ap-posting.service,
-- poster.service) and read across work-orders.routes / wo-cost-validation. BUT they were authored as
-- SOFT links ("nullable, no FK, no hard cascade") — so the DB never enforced that the value points at a
-- real work order, and the maintenance "Create Bill / Create Expense" modals (#2081) only ever wrote the
-- WO into the free-text memo, never the column. This migration turns the SOFT link into a HARD FK and
-- adds the genuinely-new unit link. It deliberately REUSES linked_work_order_uuid rather than adding a
-- second work_order_id column (which would be schema drift for the same concept — CLAUDE.md §2/§9).
--
-- WHAT THIS DOES (pure additive / hardening — NO money amounts, NO posting math, NO flag flips, NO RLS/
-- grant/security_invoker changes; adding a column inherits table-level grants, RI checks bypass RLS):
--   1. accounting.bills      : + FK linked_work_order_uuid → maintenance.work_orders(id)
--                              + NEW unit_id uuid → mdata.units(id) + indexes
--   2. accounting.expenses   : + FK linked_work_order_uuid → maintenance.work_orders(id)
--                              + NEW unit_id uuid → mdata.units(id) + indexes
--   3. Backfill the #2081 SOFT memo links ("WO: <display_id>") into linked_work_order_uuid, and fill
--      unit_id from the resolved work order. Idempotent, single-match-only, never overwrites.
--
-- Before adding each FK on the pre-existing linked_work_order_uuid, any ORPHAN value (points at no real
-- work order — a broken soft link that already references nothing) is set NULL so the validated FK can
-- be added cleanly without aborting. Idempotent / forward-only: every step guards on existence.
-- ON DELETE SET NULL: work orders + units are void-not-delete, so this only ever engages defensively.

BEGIN;

-- 1. accounting.bills ---------------------------------------------------------------------
ALTER TABLE accounting.bills ADD COLUMN IF NOT EXISTS unit_id uuid;

-- Null out any orphan soft-link so the validated FK adds cleanly.
UPDATE accounting.bills b
   SET linked_work_order_uuid = NULL
 WHERE b.linked_work_order_uuid IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM maintenance.work_orders wo WHERE wo.id = b.linked_work_order_uuid);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bills_linked_work_order_uuid_fkey'
      AND conrelid = 'accounting.bills'::regclass
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_linked_work_order_uuid_fkey
      FOREIGN KEY (linked_work_order_uuid) REFERENCES maintenance.work_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bills_unit_id_fkey'
      AND conrelid = 'accounting.bills'::regclass
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_unit_id_fkey
      FOREIGN KEY (unit_id) REFERENCES mdata.units(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_bills_linked_work_order_uuid
  ON accounting.bills (linked_work_order_uuid) WHERE linked_work_order_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_unit_id
  ON accounting.bills (unit_id) WHERE unit_id IS NOT NULL;

-- 2. accounting.expenses ------------------------------------------------------------------
ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS unit_id uuid;

UPDATE accounting.expenses e
   SET linked_work_order_uuid = NULL
 WHERE e.linked_work_order_uuid IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM maintenance.work_orders wo WHERE wo.id = e.linked_work_order_uuid);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expenses_linked_work_order_uuid_fkey'
      AND conrelid = 'accounting.expenses'::regclass
  ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_linked_work_order_uuid_fkey
      FOREIGN KEY (linked_work_order_uuid) REFERENCES maintenance.work_orders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expenses_unit_id_fkey'
      AND conrelid = 'accounting.expenses'::regclass
  ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_unit_id_fkey
      FOREIGN KEY (unit_id) REFERENCES mdata.units(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_expenses_unit_id
  ON accounting.expenses (unit_id) WHERE unit_id IS NOT NULL;
-- (idx_expenses_linked_work_order_uuid already exists — migration 202606290071.)

-- 3. Backfill the #2081 SOFT memo links → the hard FK ------------------------------------
--    #2081 folded the WO into the memo as "WO: <display_id>" ( " · "-joined with other context ).
--    Parse that token back to maintenance.work_orders.display_id and set linked_work_order_uuid. Safe:
--    only rows whose link IS NULL, matched within the SAME operating_company_id, requiring a single
--    unambiguous match. unit_id is pulled from the resolved WO only when it is a REAL mdata.units row
--    (the FK target) so the backfill can never violate the new FK. Nothing overwritten, nothing deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'bills' AND column_name = 'memo'
  ) THEN
    UPDATE accounting.bills b
       SET linked_work_order_uuid = wo.id,
           unit_id = COALESCE(b.unit_id, (SELECT u.id FROM mdata.units u WHERE u.id = wo.unit_id))
      FROM maintenance.work_orders wo
     WHERE b.linked_work_order_uuid IS NULL
       AND b.memo IS NOT NULL
       AND wo.display_id IS NOT NULL
       AND wo.operating_company_id = b.operating_company_id
       AND substring(b.memo FROM 'WO:\s*([A-Za-z0-9._\-]+)') = wo.display_id
       AND (
         SELECT count(*) FROM maintenance.work_orders wo2
          WHERE wo2.display_id = wo.display_id
            AND wo2.operating_company_id = b.operating_company_id
       ) = 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'accounting' AND table_name = 'expenses' AND column_name = 'memo'
  ) THEN
    UPDATE accounting.expenses e
       SET linked_work_order_uuid = wo.id,
           unit_id = COALESCE(e.unit_id, (SELECT u.id FROM mdata.units u WHERE u.id = wo.unit_id))
      FROM maintenance.work_orders wo
     WHERE e.linked_work_order_uuid IS NULL
       AND e.memo IS NOT NULL
       AND wo.display_id IS NOT NULL
       AND wo.operating_company_id = e.operating_company_id
       AND substring(e.memo FROM 'WO:\s*([A-Za-z0-9._\-]+)') = wo.display_id
       AND (
         SELECT count(*) FROM maintenance.work_orders wo2
          WHERE wo2.display_id = wo.display_id
            AND wo2.operating_company_id = e.operating_company_id
       ) = 1;
  END IF;
END
$$;

COMMIT;
