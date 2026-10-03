-- 202615320908 · CC-3 · ROUND 345 THE BLOCK, phase 1b — the three company-bearing foreign keys on the phase-1 line tables
-- that 202615320904 left uncovered (verify-money-lines-same-entity-fks names them): bill_lines.parent_line_uuid,
-- expense_lines.parent_line_uuid, expense_lines.linked_work_order_uuid. Measured on prod under SET LOCAL
-- app.bypass_rls = 'lucia': 0 references on all three, so each validates on no data.
--   * each composite FK repeats its single-column twin's ON DELETE; linked_work_order_uuid's SET NULL names only that
--     column (PG 15+), so deleting a work order never blanks the line's operating_company_id.
-- Idempotent. History is not modified.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.bill_lines'::regclass AND conname = 'bill_lines_parent_line_same_entity_fkey') THEN
    ALTER TABLE accounting.bill_lines ADD CONSTRAINT bill_lines_parent_line_same_entity_fkey
      FOREIGN KEY (operating_company_id, parent_line_uuid) REFERENCES accounting.bill_lines (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.bill_lines VALIDATE CONSTRAINT bill_lines_parent_line_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expense_lines'::regclass AND conname = 'expense_lines_parent_line_same_entity_fkey') THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_parent_line_same_entity_fkey
      FOREIGN KEY (operating_company_id, parent_line_uuid) REFERENCES accounting.expense_lines (operating_company_id, id) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.expense_lines VALIDATE CONSTRAINT expense_lines_parent_line_same_entity_fkey;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'accounting.expense_lines'::regclass AND conname = 'expense_lines_work_order_same_entity_fkey') THEN
    ALTER TABLE accounting.expense_lines ADD CONSTRAINT expense_lines_work_order_same_entity_fkey
      FOREIGN KEY (operating_company_id, linked_work_order_uuid) REFERENCES maintenance.work_orders (operating_company_id, id)
      ON DELETE SET NULL (linked_work_order_uuid) NOT VALID;
  END IF;
END $$;
ALTER TABLE accounting.expense_lines VALIDATE CONSTRAINT expense_lines_work_order_same_entity_fkey;
