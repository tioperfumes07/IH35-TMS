-- DOCUMENT INTEGRITY (Lead order, 2026-09-30) — CC-1
-- Same class as G2 (202614680000): a historical AlwaysTrack-feed/fuel-card import materialized
-- accounting.expense_lines rows with item_id and/or expense_account_uuid NULL (639 lines measured
-- live; 519 resolved from real source text this same day, 120 named and left as a genuine
-- remainder — no confirmed source, never guessed). This is the permanent engine-side fix: the next
-- import cannot recreate this population.
--
-- NOT VALID means it is enforced for every new INSERT/UPDATE from this point forward but does not
-- retroactively fail the 120 remaining legacy rows (deliberately grandfathered — they are named
-- and listed in docs/bus/2026-09-30-CC1-DOCUMENT-INTEGRITY-EXPENSE-LINES-639.md, never invented).
--
-- Two separate constraints, mirroring the existing expense_lines_item_qty_rate_amount_check shape
-- (which already requires quantity/rate_cents/unit_of_measure whenever item_id IS NOT NULL, but
-- does not itself require item_id to be set) and G2's settlement_lines_extra_pay_requires_item.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_item_id_required'
  ) THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_item_id_required
      CHECK (item_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_lines_expense_account_required'
  ) THEN
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT expense_lines_expense_account_required
      CHECK (expense_account_uuid IS NOT NULL)
      NOT VALID;
  END IF;
END $$;
