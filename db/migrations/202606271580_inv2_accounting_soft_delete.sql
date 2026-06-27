-- INV-2 — Add soft_deleted_at to accounting.invoice_lines and
--          voided_at/unapplied_at to accounting.payment_applications.
--          banking_rules already has is_active — use that instead of DELETE.
--
-- Audit finding (2026-06-27): four hard DELETEs on accounting tables violate the
-- void-never-delete invariant (CLAUDE.md §2, Chapter 11 legal evidence):
--
--   invoice-lines.routes.ts:266   — DELETE FROM accounting.invoice_lines (draft only)
--   payment-applications.routes.ts:152 — DELETE FROM accounting.payment_applications (unapply)
--   payments.routes.ts:404        — DELETE FROM accounting.payment_applications (on void)
--   p7-wave2.routes.ts:246        — DELETE FROM accounting.banking_rules (config)
--
-- Fix:
--   invoice_lines      → add soft_deleted_at; app uses UPDATE SET soft_deleted_at
--   payment_applications → add unapplied_at + unapplied_by_user_id; app uses UPDATE
--   banking_rules      → already has is_active boolean; app uses UPDATE SET is_active=false
--
-- Idempotent: ADD COLUMN IF NOT EXISTS is safe to re-run.

BEGIN;

-- ── accounting.invoice_lines ─────────────────────────────────────────────────
ALTER TABLE accounting.invoice_lines
  ADD COLUMN IF NOT EXISTS soft_deleted_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS soft_deleted_by  UUID        DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_active
  ON accounting.invoice_lines (invoice_id, display_order)
  WHERE soft_deleted_at IS NULL;

-- ── accounting.payment_applications ──────────────────────────────────────────
ALTER TABLE accounting.payment_applications
  ADD COLUMN IF NOT EXISTS unapplied_at          TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS unapplied_by_user_id  UUID        DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_pmt_apps_active
  ON accounting.payment_applications (payment_id)
  WHERE unapplied_at IS NULL;

COMMIT;
