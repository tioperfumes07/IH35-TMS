-- 202616220700_expense_family_parent_link.sql
-- CC-2 · OWNER RULING 443.288-A (10-23-2026 7:59 PM CT): "why are they on the wrong load, that is the real issue".
-- A fuel-card statement's card credit / card difference is booked as its OWN expense document that copied the receipt's
-- load at that moment and had NO structural link to its receipt (the receipt was only named in the memo), so every
-- load-move path carried the receipt and left the discount behind (43 Dreamline discounts, $1,976.20, measured by Lead).
--   accounting.expenses.parent_expense_id — the CHILD names its PARENT receipt, same company (composite FK onto the
--   existing uq_expenses_company_id (operating_company_id, id)); a child is never its own parent.
--   accounting.transaction_source_links role 'statement_card_difference_of' — each child posting names its parent receipt
--   on the spine (linked_object_type 'expense'), written by the engine from now on and backfilled here.
-- Backfill (idempotent, link-only — no amount, account, load or journal entry changes): a child is a live expense whose
-- vendor document number is '<statement marker>-CARD-DISC' / '-CARD-DIFF'. Its parent is, in order of evidence:
--   1. the receipt UUID its memo named (the pre-443.284 card-credit memo "on receipt <uuid>"), when that expense is live
--      in the same company;
--   2. else the ONE live expense of the fuel receipt whose notes carry the statement marker (stampDreamlineReceiptAdopted).
-- Ambiguous (more than one candidate) or unmatched children are left unlinked and counted in a NOTICE — never guessed.
-- accounting.expenses RLS is already ENABLE + FORCE (202606151300); restated idempotently.
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT set_config('app.bypass_rls', 'lucia', true);

ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS parent_expense_id uuid;
COMMENT ON COLUMN accounting.expenses.parent_expense_id IS 'OWNER RULING 443.288-A: a child document (statement card credit / card difference) names its parent receipt; it always moves load with the parent (moveExpenseFamilyToLoad) and never has its own load decision.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_parent_expense_same_entity_fkey'
                    AND conrelid = 'accounting.expenses'::regclass) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_parent_expense_same_entity_fkey
      FOREIGN KEY (operating_company_id, parent_expense_id)
      REFERENCES accounting.expenses (operating_company_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_parent_expense_not_self'
                    AND conrelid = 'accounting.expenses'::regclass) THEN
    ALTER TABLE accounting.expenses
      ADD CONSTRAINT expenses_parent_expense_not_self CHECK (parent_expense_id IS NULL OR parent_expense_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_expenses_parent_expense
  ON accounting.expenses (operating_company_id, parent_expense_id) WHERE parent_expense_id IS NOT NULL;

ALTER TABLE accounting.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.expenses FORCE ROW LEVEL SECURITY;

-- Backfill the parent link.
WITH kids AS (
  SELECT c.id, c.operating_company_id,
         regexp_replace(c.vendor_document_number, '-CARD-(DISC|DIFF)$', '') AS marker,
         substring(c.memo FROM 'on receipt ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') AS memo_receipt
    FROM accounting.expenses c
   WHERE c.parent_expense_id IS NULL AND c.voided_at IS NULL
     AND c.vendor_document_number ~ '-CARD-(DISC|DIFF)$'
), by_memo AS (
  SELECT k.id AS child_id, e.id AS parent_id
    FROM kids k
    JOIN accounting.expenses e ON e.operating_company_id = k.operating_company_id AND e.id::text = k.memo_receipt
                              AND e.voided_at IS NULL AND e.id <> k.id
), by_marker AS (
  SELECT k.id AS child_id, e.id AS parent_id
    FROM kids k
    JOIN fuel.fuel_transactions ft ON ft.operating_company_id = k.operating_company_id AND ft.voided_at IS NULL
                                  AND k.marker = ANY (SELECT btrim(x) FROM unnest(string_to_array(COALESCE(ft.notes, ''), ';')) x)
    JOIN accounting.expenses e ON e.operating_company_id = ft.operating_company_id AND e.source_fuel_transaction_id = ft.id
                              AND e.voided_at IS NULL AND e.id <> k.id
   WHERE k.id NOT IN (SELECT child_id FROM by_memo)
), chosen AS (
  SELECT child_id, (array_agg(DISTINCT parent_id))[1] AS parent_id
    FROM (SELECT * FROM by_memo UNION ALL SELECT * FROM by_marker) u
   GROUP BY child_id
  HAVING count(DISTINCT parent_id) = 1
)
UPDATE accounting.expenses c
   SET parent_expense_id = chosen.parent_id, updated_at = now()
  FROM chosen
 WHERE c.id = chosen.child_id AND c.parent_expense_id IS NULL;

-- Backfill the spine role on every posting of a linked child's journal entry.
INSERT INTO accounting.transaction_source_links
       (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role, created_at)
SELECT p.operating_company_id, p.id, 'expense', c.parent_expense_id::text, 'statement_card_difference_of', now()
  FROM accounting.expenses c
  JOIN accounting.journal_entry_postings p ON p.operating_company_id = c.operating_company_id
                                          AND p.journal_entry_uuid = c.journal_entry_id
 WHERE c.parent_expense_id IS NOT NULL AND c.journal_entry_id IS NOT NULL
ON CONFLICT (journal_entry_posting_id, linked_object_type, linked_object_id, COALESCE(relationship_role, '')) DO NOTHING;

DO $$
DECLARE linked int; unlinked int;
BEGIN
  SELECT count(*) FILTER (WHERE parent_expense_id IS NOT NULL), count(*) FILTER (WHERE parent_expense_id IS NULL)
    INTO linked, unlinked
    FROM accounting.expenses
   WHERE voided_at IS NULL AND vendor_document_number ~ '-CARD-(DISC|DIFF)$';
  RAISE NOTICE '443.288-A statement card-difference children: % linked to their receipt, % left unlinked (no single parent)', linked, unlinked;
END $$;
COMMIT;
