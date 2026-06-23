# Block 8 gap 3 — WO serialized-part asset-location (MIGRATION SQL FOR REVIEW)

**Status:** PROPOSED SQL — **DO NOT RUN / DO NOT MERGE** until Jorge + GUARD approve (same gate as #1341).
**Date:** 2026-06-22
**Why:** GUARD gap 3 wants an asset-location record for **serialized parts** (tires/batteries/lamps/mirrors):
part + serial + position on the unit. Schema check: there is a tire program (`0363_maint_tire_program.sql`) but
**no generic serialized-part placement store** (no `serial_number`/position columns on WO lines or parts).
Adding storage = a `db/migrations/*.sql` → §1.4 financial-cluster gate → SQL shown here first; UI/API wiring
held until it lands.

## Proposed migration (file would be `db/migrations/<next-timestamp>_block8_wo_serialized_parts.sql`)

```sql
-- Block 8 — per-WO serialized-part placements (asset-location map): which serialized part went where on the
-- unit. Additive new table, idempotent, entity-scoped, append-friendly. New table needs explicit GRANTs +
-- the standard audit trigger (every table gets is_active + audit, void-not-delete).
BEGIN;

CREATE TABLE IF NOT EXISTS maintenance.wo_serialized_parts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),   -- UUIDv7 server-gen in app layer
  operating_company_id   uuid NOT NULL,                                -- RLS scoping (TRANSP only in scope)
  work_order_id          uuid NOT NULL REFERENCES maintenance.work_orders(id),
  unit_id                uuid NULL,                                    -- the asset the part is mounted on
  part_catalog_id        uuid NULL REFERENCES catalogs.parts(id),      -- NULL until brand catalog loaded
  part_label             text NOT NULL,                                -- free-text part name (no fabricated #s)
  part_type              text NOT NULL CHECK (part_type IN ('tire','battery','lamp','mirror','other')),
  serial_number          text NULL,
  position_code          text NULL,                                    -- e.g. tire LF/RF/LR-IN/LR-OUT; lamp L/R
  notes                  text NULL,
  is_active              boolean NOT NULL DEFAULT true,
  voided_at              timestamptz NULL,                             -- void-not-delete
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wo_serialized_parts_wo_idx ON maintenance.wo_serialized_parts (work_order_id);
CREATE INDEX IF NOT EXISTS wo_serialized_parts_unit_idx ON maintenance.wo_serialized_parts (unit_id);

-- Runtime role grants (NEW table does NOT inherit; must be granted or it 500s at runtime — see §2).
GRANT SELECT, INSERT, UPDATE, DELETE ON maintenance.wo_serialized_parts TO ih35_app;

COMMIT;

-- NOTE for review: also attach the standard audit trigger used by the other maintenance tables (the exact
-- trigger name/function is in 0276_audit_triggers.sql — wire it in the real migration so row changes are
-- captured in audit.row_changes per §2). Left out of this preview to keep the SQL focused on shape.
```

### Notes for review
- **New table → explicit GRANT** (does not inherit; §2 landmine — otherwise runtime 500). Audit trigger to be
  attached per the standard maintenance pattern (`0276_audit_triggers.sql`).
- **Entity-scoped:** `operating_company_id` for RLS; TRANSP only in scope now.
- **No fabricated parts:** `part_catalog_id` is nullable and `part_label` is free text until Jorge supplies
  authoritative brand parts data (Block 4) — same staging as the parts-catalog picker (gap 4).
- **void-not-delete + is_active** per §2.
- **Number:** timestamp filename; re-checked vs `origin/main` max at push.

### After approval — the wiring (held until this merges)
Add an **Asset-location** sub-section to `CreateWorkOrderModal` for serialized parts (part type + label + serial
+ position), persist via a new `maintenance` route, and read it back on the WO detail. Additive; §7 navy.
