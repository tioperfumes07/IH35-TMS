-- 202612530000_trip_wiring_01_fuel_expense_accident_trailer_id.sql
-- CREATE-PATH TRIP WIRING (owner packet FINAL-WEEKEND-FULL-WIRING-2026-08-12, rank 1, CC-1).
--
-- ROOT CAUSE: trailers (mdata.equipment, equipment_type carries DryVan/Reefer/Flatbed/etc.) are the
-- physical asset a fuel purchase, an office expense, or an accident report can be attributed to, in
-- addition to the tractor (unit_id). None of fuel.fuel_transactions, accounting.expenses, or
-- safety.accident_reports carry that FK today (verified live on prod br-fancy-credit-akjnd07a — no
-- trailer_id column on any of the three). mdata.loads.load_trailer_equipment_id points at
-- catalogs.load_trailer_equipment (a TYPE catalog: "what kind of trailer this load needs"), not a
-- physical mdata.equipment row — it cannot stand in for this FK.
--
-- FIX: additive trailer_id FK to mdata.equipment(id) on all three tables, mirroring the existing
-- established convention already used by banking.bank_transaction_splits.trailer_id,
-- driver_finance.driver_advances.trailer_id, insurance.claim.trailer_id,
-- maintenance.dvir_submissions.trailer_id, safety.dot_inspections.trailer_id,
-- safety.dvir_submissions.trailer_id, safety.incidents.trailer_id — all of which are unenforced
-- (no FK constraint on prod). This migration adds a REAL FK constraint (an improvement, not a
-- regression) since mdata.equipment.id is a stable canonical PK and there is no reason to leave the
-- link unenforced going forward.
--
-- SCOPE: schema only. No GL math, no posting, no backfill of historical rows (going-forward only —
-- a NULL trailer_id on an existing row is correct, not a defect; nothing here invents a load or
-- trailer relationship that create-path evidence does not support).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS with inline named FK — a no-op re-run when the column already
-- exists, including on prod where this was applied ahead of commit via a verified neondb_owner
-- connection with matching constraint names), fresh-DB-safe.
--
-- Inline REFERENCES (not a separate ADD CONSTRAINT) so this satisfies verify-orphan-fk-inventory.mjs,
-- which only recognizes an FK declared in the same column definition.

BEGIN;

-- ── fuel.fuel_transactions ───────────────────────────────────────────────────────────────────────
ALTER TABLE fuel.fuel_transactions
  ADD COLUMN IF NOT EXISTS trailer_id uuid
    CONSTRAINT fuel_transactions_trailer_id_fkey REFERENCES mdata.equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fuel_tx_company_trailer_date_idx
  ON fuel.fuel_transactions (operating_company_id, trailer_id, transaction_at DESC)
  WHERE trailer_id IS NOT NULL;

-- ── accounting.expenses ──────────────────────────────────────────────────────────────────────────
ALTER TABLE accounting.expenses
  ADD COLUMN IF NOT EXISTS trailer_id uuid
    CONSTRAINT expenses_trailer_id_fkey REFERENCES mdata.equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_trailer_id
  ON accounting.expenses (trailer_id)
  WHERE trailer_id IS NOT NULL;

-- ── safety.accident_reports ──────────────────────────────────────────────────────────────────────
ALTER TABLE safety.accident_reports
  ADD COLUMN IF NOT EXISTS trailer_id uuid
    CONSTRAINT fk_accident_reports_trailer REFERENCES mdata.equipment(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accident_reports_trailer
  ON safety.accident_reports (trailer_id)
  WHERE trailer_id IS NOT NULL;

COMMIT;
