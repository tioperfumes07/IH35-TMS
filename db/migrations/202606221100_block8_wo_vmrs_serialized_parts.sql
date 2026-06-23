-- Block 8 — VMRS repair detail on work orders + serialized-part asset-location placements.
-- APPROVED by Jorge + GUARD to RUN (review artifact: docs/specs/block8-wo-vmrs-migration.md +
-- docs/specs/block8-wo-asset-location-migration.md). GUARD hardening asks applied:
--   (1) wo_serialized_parts has an index LEADING with operating_company_id (per-entity query perf),
--   (2) operating_company_id is NOT NULL + FK to org.companies(id) — the repo-wide convention (430+ tables).
-- Additive, idempotent, entity-scoped, void-not-delete. New table gets explicit ih35_app GRANTs (does NOT
-- inherit) + the standard audit row trigger via audit.ensure_row_trigger (drift-capture, same as other
-- maintenance tables).
BEGIN;

-- ── Gap 2: VMRS three-level coding + the repair "3 Cs" on the work order ──────────────────────────────
ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS vmrs_system_code    text NULL,
  ADD COLUMN IF NOT EXISTS vmrs_assembly_code  text NULL,
  ADD COLUMN IF NOT EXISTS vmrs_component_code text NULL,
  ADD COLUMN IF NOT EXISTS out_of_service      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repair_complaint    text NULL,
  ADD COLUMN IF NOT EXISTS repair_cause        text NULL,
  ADD COLUMN IF NOT EXISTS repair_correction   text NULL;

-- ── Gap 3: per-WO serialized-part placements (asset-location map) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance.wo_serialized_parts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id   uuid NOT NULL REFERENCES org.companies(id),          -- hardening (2): FK + NOT NULL
  work_order_id          uuid NOT NULL REFERENCES maintenance.work_orders(id),
  unit_id                uuid NULL,
  part_catalog_id        uuid NULL,                                           -- FK added when brand catalog confirmed
  part_label             text NOT NULL,                                       -- free text — no fabricated part #s
  part_type              text NOT NULL CHECK (part_type IN ('tire','battery','lamp','mirror','other')),
  serial_number          text NULL,
  position_code          text NULL,                                           -- e.g. tire LF/RF/LR-IN/LR-OUT
  notes                  text NULL,
  is_active              boolean NOT NULL DEFAULT true,
  voided_at              timestamptz NULL,                                    -- void-not-delete
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

-- hardening (1): index LEADING with operating_company_id (per-entity scans + partitioning consistency).
CREATE INDEX IF NOT EXISTS wo_serialized_parts_company_wo_idx
  ON maintenance.wo_serialized_parts (operating_company_id, work_order_id);
CREATE INDEX IF NOT EXISTS wo_serialized_parts_unit_idx
  ON maintenance.wo_serialized_parts (unit_id);

-- New table → explicit GRANT (does NOT inherit; §2 / docs/CLAUDE.md §15 — else runtime 500).
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance.wo_serialized_parts TO ih35_app;

-- Standard append-only audit row trigger (drift-capture), same helper the other maintenance tables use.
SELECT audit.ensure_row_trigger('maintenance', 'wo_serialized_parts');

COMMIT;
