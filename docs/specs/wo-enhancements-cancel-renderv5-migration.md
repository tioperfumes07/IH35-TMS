# WO enhancements — render-v5 header gaps + Cancel/Void (MIGRATION SQL FOR REVIEW)

**Status:** PROPOSED SQL — **DO NOT RUN / DO NOT MERGE** until Jorge + GUARD approve (same gate as #1341/#1348).
**Date:** 2026-06-22
**Covers:** (A) the render-v5 header fields missing columns, (B) WO **Cancel** (non-financial, ship-on-green
once columns exist), (C) WO **Void** columns (Tier-1, flagged OFF — `WO_VOID_ENABLED`, do not enable until
CHAIN-03 posting is live + a balanced reversing JE is proven on a Neon branch).

## What already exists on `maintenance.work_orders` (no migration needed for these)
`wo_priority` (text), `status` (text default 'open'), `opened_at`, `closed_at`, `repair_location`,
`roadside_location`, `vendor_invoice_number`; VMRS cols land in migration 202606221100 (#1348). Audit row
trigger is already attached (`audit.ensure_row_trigger('maintenance','work_orders')`) — so Cancel/Void writes
are tamper-evident automatically.

## Proposed migration (`db/migrations/<next-timestamp>_wo_enhancements_cancel.sql`)

```sql
BEGIN;

-- ── (A) render-v5 header gaps ─────────────────────────────────────────────────────────────────────────
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS authorized_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS authorization_number  text NULL,
  ADD COLUMN IF NOT EXISTS service_location_type text NULL
    CHECK (service_location_type IS NULL OR service_location_type IN ('shop','mobile','roadside')),
  ADD COLUMN IF NOT EXISTS repaired_by           text NULL
    CHECK (repaired_by IS NULL OR repaired_by IN ('in_house','outside_vendor'));

-- ── (B) WO Cancel (non-financial) ─────────────────────────────────────────────────────────────────────
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS cancelled_at        timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason_code  text NULL,
  ADD COLUMN IF NOT EXISTS cancel_notes        text NULL;
-- status is free text (no CHECK on maintenance.work_orders) → 'cancelled' is accepted without an enum change.

-- WO cancellation reasons catalog (mirrors catalogs.cancellation_reasons; preValidation MUST validate against
-- THIS catalog, not a hard-coded enum — that's the #1335 lesson). Entity-agnostic global catalog.
CREATE TABLE IF NOT EXISTS catalogs.wo_cancellation_reasons (
  reason_code             text PRIMARY KEY,
  reason_label            text NOT NULL,
  requires_owner_approval boolean NOT NULL DEFAULT false,
  sort_order              integer NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true
);
INSERT INTO catalogs.wo_cancellation_reasons (reason_code, reason_label, sort_order) VALUES
  ('DUPLICATE',         'Duplicate',          10),
  ('CREATED_IN_ERROR',  'Created in error',   20),
  ('NOT_NEEDED',        'Not needed',         30),
  ('WRONG_UNIT',        'Wrong unit',         40),
  ('VENDOR_DECLINED',   'Vendor declined',    50),
  ('OTHER',             'Other',              60)
ON CONFLICT (reason_code) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs.wo_cancellation_reasons TO ih35_app;

-- ── (C) WO Void (Tier-1, flagged OFF — columns only; reversing logic ships behind WO_VOID_ENABLED) ──────
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS voided_at         timestamptz NULL,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid NULL REFERENCES identity.users(id),
  ADD COLUMN IF NOT EXISTS void_reason_code  text NULL,
  ADD COLUMN IF NOT EXISTS void_notes        text NULL,
  ADD COLUMN IF NOT EXISTS reversing_entry_ref text NULL;   -- the reversing Bill/Expense/JE id (void only)

COMMIT;
```

### Notes for review
- **§1.4 / catalogs.\*:** this touches `catalogs.*` (new `wo_cancellation_reasons`) → financial-cluster gate.
  Posted for review; NOT self-merged.
- **#1335 lesson:** the WO-cancel preValidation will validate `cancel_reason_code` against
  `catalogs.wo_cancellation_reasons` (the catalog the dropdown is fed from), NOT a hard-coded enum.
- **Audit:** already attached to `work_orders` — Cancel/Void rows are captured in `audit.row_changes`. The
  WO-detail "History/Audit" panel reads from there.
- **RBAC:** Cancel + Void routes gate to {owner, administrator} server-side (existing role from identity/me).
- **Void HOLD:** void columns ship dormant; the reversing-entry logic is built behind `WO_VOID_ENABLED`
  (default OFF) and stays off until CHAIN-03 `BILL_GL_POSTING_ENABLED` is on + a branch proves a balanced reversal.
- **Per-entity:** all WO rows already carry `operating_company_id`; the catalog is global (reason codes).

### After approval — the build
Cancel route + RBAC + reason-from-catalog + "Cancel WO" UI (owner/admin only) + History/Audit panel; render-v5
header fields wired into the modal; Void behind the flag (design shown, OFF).
