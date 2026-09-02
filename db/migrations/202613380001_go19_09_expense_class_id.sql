-- GO-19-09 (migration 202613380001) — accounting.expenses gains class_id, mirroring accounting.bills.class_id exactly
-- (same FK shape: simple FK to catalogs.classes(id), not the entity-scoped composite FK that
-- catalogs.classes now also supports -- kept consistent with the existing bills column rather
-- than diverging, so the two header tables behave identically for this dimension).
-- Additive, idempotent, nullable. No GL math. No QBO write-back. No data touched.
--
-- CC-3 handoff (cross-session, 2026-09-02): CC-3's backend (expenses.routes.ts, posting-engine.service.ts
-- -- class_id propagated to debit lines only, never credit), frontend form field, and guard
-- scripts/verify-expense-class-id-parity.mjs are already built and typechecked on CC-3's own branch,
-- barred from carrying this file itself by verify-migration-lane-band.mjs (money/schema migrations
-- stay on cc-1/claude or cursor). This migration's content was already validated live on a
-- disposable Neon branch and applied verbatim to prod by CC-3's own session BEFORE this file was
-- committed -- CC-1 independently re-verified live (information_schema.columns + pg_constraint,
-- 2026-09-02) that accounting.expenses.class_id + expenses_class_id_fkey already exist exactly as
-- written below -- this commit is ledger-file catch-up, not a fresh apply.

BEGIN;

ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS class_id uuid NULL;

DO $$
BEGIN
  IF to_regclass('catalogs.classes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'expenses_class_id_fkey'
        AND conrelid = 'accounting.expenses'::regclass
    ) THEN
      ALTER TABLE accounting.expenses
        ADD CONSTRAINT expenses_class_id_fkey
        FOREIGN KEY (class_id) REFERENCES catalogs.classes(id);
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN accounting.expenses.class_id IS
  'QBO Class reporting dimension on the expense header (catalogs.classes). Nullable. Mirrors accounting.bills.class_id.';

COMMIT;
