-- ACCT-F5686 — closes CLS-BILLLINE-CATEGORY-NO-FK: accounting.bill_lines.expense_category_uuid
-- has NO foreign key at all (only bill_lines_account_id_fkey / _load_id_fkey /
-- _parent_line_uuid_fkey exist), so it has been silently able to hold a GL ACCOUNT id instead of
-- a real category id. The write-path half of this defect was already fixed under ACCT-F194 (bill
-- lines now write NULL, never an account id, when no category resolves — verified live via
-- verify-billline-category-not-account-id.mjs, currently green). This migration closes the
-- schema half: the FK the board row says "stays open" because the write-path fix alone cannot
-- prevent a FUTURE writer (a different code path, a direct SQL fix-up, a future feature) from
-- reintroducing the same defect.
--
-- MIRRORS the already-shipped, already-proven sibling migration
-- 202608020000_acct_link_04_expense_lines_expense_category_fk.sql (ACCT-LINK-04) EXACTLY: same
-- entity-derivation-trigger pattern, same composite same-entity FK shape, same MATCH SIMPLE
-- nullability (an uncategorized line stays legal). accounting.bill_lines carries no
-- operating_company_id of its own (same shape as expense_lines did) — it inherits its entity from
-- the parent bill via bill_id, so a single-column FK on expense_category_uuid alone would let a
-- line point at another entity's category. §0 below repairs the WORM-honest way (repair, never
-- delete) the exact 5 rows live-confirmed on prod 2026-08-21 (bypass_rls=lucia, USMCA,
-- all 5 with expense_category_uuid = account_id, none resolving to a real
-- catalogs.expense_categories row) — set to NULL, matching the already-fixed write path's own
-- correct behavior for "no category resolves." The repair query is a dynamic same-entity orphan
-- detection, not a hardcoded id list, so it self-heals any future orphan too, not just the 5
-- known today.
--
-- POSTS NOTHING. No journal entry, no GL account, no amount, no posting flag is touched. §0 only
-- clears an incorrect categorization pointer on 5 known rows (repair, not delete — the bill line
-- itself, its account_id, and its amount are completely untouched). Never deletes: no row is
-- removed and no existing column or constraint is dropped.
-- Idempotent: every step is IF NOT EXISTS / catalog-probe guarded; safe to apply twice. HELD —
-- accounting.bill_lines is a large, live, actively-written financial table (155,284+ rows on
-- prod), same class of risk the sibling expense_lines migration was HELD for, even though that
-- table had 0 rows at authoring time; rehearsed on a disposable Neon branch before any prod apply
-- (see PR body for the exact rehearsal proof).

BEGIN;

-- §0 — WORM-honest repair of the known orphaned rows (dynamic detection, not a hardcoded id
-- list): a categorized bill_lines row whose expense_category_uuid does not resolve to a real,
-- same-entity catalogs.expense_categories row is set back to NULL — the exact behavior the
-- already-fixed write path (ACCT-F194) uses for "no category resolves." This must run BEFORE §7
-- adds the FK, or the FK addition would fail loud on these same rows.
DO $$
DECLARE
  v_repaired integer;
BEGIN
  IF to_regclass('accounting.bill_lines') IS NULL OR to_regclass('accounting.bills') IS NULL
     OR to_regclass('catalogs.expense_categories') IS NULL THEN
    RAISE NOTICE 'ACCT-F5686: prerequisites absent — skip §0 repair';
    RETURN;
  END IF;

  WITH orphaned AS (
    SELECT bl.id
    FROM accounting.bill_lines bl
    JOIN accounting.bills b ON b.id = bl.bill_id
    WHERE bl.expense_category_uuid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM catalogs.expense_categories ec
        WHERE ec.id = bl.expense_category_uuid
          AND ec.operating_company_id = b.operating_company_id
      )
  )
  UPDATE accounting.bill_lines bl
     SET expense_category_uuid = NULL
    FROM orphaned o
   WHERE bl.id = o.id;
  GET DIAGNOSTICS v_repaired = ROW_COUNT;
  RAISE NOTICE 'ACCT-F5686: §0 repaired % orphaned bill_lines.expense_category_uuid row(s) to NULL', v_repaired;
END
$$;

-- 1. Parent-side composite key the same-entity FK references. Pure additive UNIQUE constraint
--    over a column already unique-by-id, so it cannot reject existing rows.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_bills_company_id'
      AND conrelid = 'accounting.bills'::regclass
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT uq_bills_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

-- 2. Entity column on the line. Nullable at creation so the backfill and the trigger can
--    populate it before NOT NULL is asserted in step 4.
ALTER TABLE accounting.bill_lines
  ADD COLUMN IF NOT EXISTS operating_company_id uuid REFERENCES org.companies(id);

-- 3. Backfill from the parent bill.
UPDATE accounting.bill_lines l
SET operating_company_id = b.operating_company_id
FROM accounting.bills b
WHERE b.id = l.bill_id
  AND l.operating_company_id IS DISTINCT FROM b.operating_company_id;

-- 4. Derive-from-parent trigger — makes the composite FK real rather than decorative: a writer
--    that never learned about the new column still gets the correct entity stamped, and a writer
--    that guesses wrong is overwritten by the header's truth rather than silently trusted.
CREATE OR REPLACE FUNCTION accounting.bill_lines_derive_company()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company uuid;
BEGIN
  SELECT b.operating_company_id INTO v_company
  FROM accounting.bills b
  WHERE b.id = NEW.bill_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'E_BILL_LINE_PARENT_NOT_VISIBLE: bill % not found in scope for bill_line', NEW.bill_id;
  END IF;

  NEW.operating_company_id := v_company;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_bill_lines_derive_company ON accounting.bill_lines;
CREATE TRIGGER trg_bill_lines_derive_company
  BEFORE INSERT OR UPDATE OF bill_id, operating_company_id ON accounting.bill_lines
  FOR EACH ROW
  EXECUTE FUNCTION accounting.bill_lines_derive_company();

-- 5. NOT NULL once every row carries an entity. Guarded so a partially-backfilled table fails
--    loud in verification instead of aborting the migration.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounting.bill_lines WHERE operating_company_id IS NULL) THEN
    ALTER TABLE accounting.bill_lines ALTER COLUMN operating_company_id SET NOT NULL;
  END IF;
END $$;

-- 6. Line → parent bill, same entity. Redundant with the trigger by design: if the trigger is
--    ever dropped, the database still refuses a line whose entity disagrees with its header.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bill_lines_bill_same_entity_fkey'
      AND conrelid = 'accounting.bill_lines'::regclass
  ) THEN
    ALTER TABLE accounting.bill_lines
      ADD CONSTRAINT bill_lines_bill_same_entity_fkey
      FOREIGN KEY (operating_company_id, bill_id)
      REFERENCES accounting.bills (operating_company_id, id);
  END IF;
END $$;

-- 7. THE ACCT-F5686 LINK: line → catalogs.expense_categories, same entity. MATCH SIMPLE means an
--    uncategorized line (expense_category_uuid IS NULL) stays legal; a categorized line must
--    point at a category belonging to the very entity the line's bill belongs to. §0 above
--    already cleared every currently-orphaned row, so this should never hit its own guard clause
--    on a normal apply — the guard exists so a re-apply over any future dirty data reports
--    honestly instead of half-applying, exactly like the sibling migration.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bill_lines_expense_category_same_entity_fkey'
      AND conrelid = 'accounting.bill_lines'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM accounting.bill_lines l
      WHERE l.expense_category_uuid IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM catalogs.expense_categories ec
          WHERE ec.id = l.expense_category_uuid
            AND ec.operating_company_id = l.operating_company_id
        )
    ) THEN
      RAISE EXCEPTION
        'E_BILL_LINE_CATEGORY_ORPHAN: accounting.bill_lines holds category pointers that do not resolve in catalogs.expense_categories for the same entity — resolve them before this FK can be added';
    END IF;

    ALTER TABLE accounting.bill_lines
      ADD CONSTRAINT bill_lines_expense_category_same_entity_fkey
      FOREIGN KEY (operating_company_id, expense_category_uuid)
      REFERENCES catalogs.expense_categories (operating_company_id, id);
  END IF;
END $$;

-- 8. Read paths: reverse drill (category -> its bill lines) and entity filtering.
CREATE INDEX IF NOT EXISTS idx_bill_lines_expense_category
  ON accounting.bill_lines (expense_category_uuid)
  WHERE expense_category_uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bill_lines_company
  ON accounting.bill_lines (operating_company_id);

-- No RLS or grant change: accounting.bill_lines already has FORCE ROW LEVEL SECURITY (verified
-- live 2026-08-21) and ih35_app table grants; table-level grants cover the new column.

COMMIT;
