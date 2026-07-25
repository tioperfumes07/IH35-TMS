-- 202607950000_acct_link_04_expense_lines_expense_category_fk.sql
--
-- HELD — DO NOT RUN ON PROD until owner Neon-applies.
--
-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] ACCT-LINK-04 (spec ACCT-F07):
-- "expense_categories inbound FK from expense lines — 0 inbound FKs".
--
-- ROOT CAUSE (verified on prod br-fancy-credit-akjnd07a, 2026-07-24):
--   catalogs.expense_categories has ZERO inbound foreign keys. accounting.expense_lines has carried a
--   bare `expense_category_uuid uuid` since migration 0050 (two-section v5), which was authored BEFORE
--   catalogs.expense_categories existed (migration 0152). The column was therefore never constrained
--   and never entity-scoped — it is a dangling pointer. The single non-NULL category value anywhere on
--   prod (accounting.bill_lines, 1 of 155,049 rows) resolves in NEITHER category catalog.
--
-- LIVE STATE (RLS-honest — catalogs.expense_categories' company_scope policy has NO lucia-bypass
-- branch, so a bare count of 0 is a FALSE EMPTY; re-read with app.operating_company_id per entity):
--   catalogs.expense_categories   9 rows   FUEL / REPAIR / PERMIT × TRANSP / TRK / USMCA
--   catalogs.qbo_categories       0 rows   all three entities
--   accounting.expenses           0 rows
--   accounting.expense_lines      0 rows   <- zero-backfill window; constrain it now
--
-- SCOPE: turn the category pointer into a real, SAME-ENTITY foreign key.
--   accounting.expense_lines carries no operating_company_id of its own — it inherits its entity from
--   the parent expense through RLS. A single-column FK would therefore let a line point at another
--   entity's category, which the linkage law classes as a defect. So this migration adds the entity
--   column, derives it from the parent expense in a BEFORE trigger (no writer can leave it NULL or
--   disagree with its header), and hangs both links off the composite key.
--
-- POSTS NOTHING. No journal entry, no GL account, no amount, no posting flag is touched.
-- Never deletes: no row is removed and no existing column or constraint is dropped.
-- Idempotent: every step is IF NOT EXISTS / catalog-probe guarded; safe to apply twice.

BEGIN;

-- 1. Parent-side composite keys the same-entity FKs reference. Both are pure additive UNIQUE
--    constraints over columns that are already unique-by-id, so they cannot reject existing rows.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_expense_categories_company_id'
      AND conrelid = 'catalogs.expense_categories'::regclass
  ) THEN
    ALTER TABLE catalogs.expense_categories
      ADD CONSTRAINT uq_expense_categories_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_expenses_company_id'
      AND conrelid = 'accounting.expenses'::regclass
  ) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT uq_expenses_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

-- 2. Entity column on the line. Nullable at creation so the backfill and the trigger can populate it
--    before NOT NULL is asserted in step 5. The inline org.companies reference keeps it from being an
--    orphan-FK column; the same-entity composite links in steps 6-7 sit on top of it.
ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);

-- 3. Backfill from the parent expense. 0 rows on prod today; kept so a re-apply after the table fills
--    still lands every line on its header's entity.
UPDATE accounting.expense_lines l
SET operating_company_id = e.operating_company_id
FROM accounting.expenses e
WHERE e.id = l.expense_id
  AND l.operating_company_id IS DISTINCT FROM e.operating_company_id;

-- 4. Derive-from-parent trigger. This is what makes the composite FK real rather than decorative: a
--    writer that never learned about the new column still gets the correct entity stamped, and a
--    writer that guesses wrong is overwritten by the header's truth rather than silently trusted.
CREATE OR REPLACE FUNCTION accounting.expense_lines_derive_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT e.operating_company_id INTO v_company
  FROM accounting.expenses e
  WHERE e.id = NEW.expense_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'E_EXPENSE_LINE_PARENT_NOT_VISIBLE: expense % not found in scope for expense_line', NEW.expense_id;
  END IF;

  NEW.operating_company_id := v_company;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_expense_lines_derive_company ON accounting.expense_lines;
CREATE TRIGGER trg_expense_lines_derive_company
  BEFORE INSERT OR UPDATE OF expense_id, operating_company_id ON accounting.expense_lines
  FOR EACH ROW
  EXECUTE FUNCTION accounting.expense_lines_derive_company();

-- 5. NOT NULL once every row carries an entity. Guarded so a partially-backfilled table fails loud in
--    verification instead of aborting the migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounting.expense_lines WHERE operating_company_id IS NULL) THEN
    ALTER TABLE accounting.expense_lines ALTER COLUMN operating_company_id SET NOT NULL;
  END IF;
END $$;

-- 6. Line → parent expense, same entity. Redundant with the trigger by design: if the trigger is ever
--    dropped, the database still refuses a line whose entity disagrees with its header.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_lines_expense_same_entity_fkey'
      AND conrelid = 'accounting.expense_lines'::regclass
  ) THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_expense_same_entity_fkey
      FOREIGN KEY (operating_company_id, expense_id)
      REFERENCES accounting.expenses (operating_company_id, id);
  END IF;
END $$;

-- 7. THE ACCT-LINK-04 LINK: line → catalogs.expense_categories, same entity.
--    MATCH SIMPLE means an uncategorized line (expense_category_uuid IS NULL) stays legal — QBO-style,
--    a line may be uncategorized — while a categorized line must point at a category that belongs to
--    the very entity the line's expense belongs to.
--    Guarded on there being no violating row so a re-apply over dirty data reports honestly instead of
--    half-applying.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'expense_lines_expense_category_same_entity_fkey'
      AND conrelid = 'accounting.expense_lines'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM accounting.expense_lines l
      WHERE l.expense_category_uuid IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM catalogs.expense_categories ec
          WHERE ec.id = l.expense_category_uuid
            AND ec.operating_company_id = l.operating_company_id
        )
    ) THEN
      RAISE EXCEPTION
        'E_EXPENSE_LINE_CATEGORY_ORPHAN: accounting.expense_lines holds category pointers that do not resolve in catalogs.expense_categories for the same entity — resolve them before this FK can be added';
    END IF;

    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_expense_category_same_entity_fkey
      FOREIGN KEY (operating_company_id, expense_category_uuid)
      REFERENCES catalogs.expense_categories (operating_company_id, id);
  END IF;
END $$;

-- 8. Read paths: reverse drill (category -> its expense lines) and entity filtering.
CREATE INDEX IF NOT EXISTS idx_expense_lines_expense_category
  ON accounting.expense_lines (expense_category_uuid)
  WHERE expense_category_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_lines_company
  ON accounting.expense_lines (operating_company_id);

-- No RLS or grant change: accounting.expense_lines already has FORCE ROW LEVEL SECURITY with the
-- expense_lines_company_isolation policy (parent-scoped + lucia bypass) and ih35_app table grants
-- from 202606080040. Table-level grants cover the new column.

COMMIT;
