═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-CRITICAL / TASK GAP-4 — G13 QBO Vendor Tab + Class on Driver/Asset Profiles
MERGE LINK: pending — Claude posts URL within 60s of Cursor push
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-B (post-CLOSURE-30 PASS-8 GO)  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER GAP queue unpauses (CLOSURE-30 GO)
PAIRED WITH: GAP-6 (Lane B) — same wave G-B

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-6 owned):
  apps/backend/src/maintenance/work-orders/**
  apps/frontend/src/pages/maintenance/work-orders/**
  migrations/0298_wo_time_tracking_*.sql

ALLOWED FILES (disjoint from Lane B):
  migrations/0297_driver_asset_qbo_vendor_class.sql                         (NEW)
  apps/backend/src/master-data/drivers/driver-qbo-vendor.routes.ts          (NEW)
  apps/backend/src/master-data/units/unit-qbo-class.routes.ts               (NEW)
  apps/backend/src/master-data/drivers/__tests__/qbo-vendor-link.test.ts    (NEW)
  apps/backend/src/master-data/units/__tests__/qbo-class-link.test.ts       (NEW)
  apps/frontend/src/pages/drivers/DriverDetail.tsx                          (EDIT — add tab)
  apps/frontend/src/pages/assets/AssetDetail.tsx                            (EDIT — add field)
  apps/frontend/src/components/drivers/QboVendorTab.tsx                     (NEW)
  apps/frontend/src/components/assets/QboClassField.tsx                     (NEW)
  scripts/verify-qbo-vendor-driver-mapping.mjs                              (NEW CI guard)
  docs/specs/gap-4-qbo-vendor-class-mapping.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G13 master rule (B_Jorge_Directives row 13) — "operational mapping
        critical for accounting" · Tracker QBO Sync Track item #8 P5-T10
        PENDING 60min · Confirmed missing in PASS-2 audit · ADDITIVE-ONLY rule

PROBLEM: Drivers and Assets currently have NO surfaced relationship to their
QBO Vendor (drivers) or QBO Class (assets/units). This breaks:
  (a) Accounting attribution (settlements can't auto-route to correct vendor)
  (b) Class-based reporting (P&L by truck/trailer requires class assignment)
  (c) Driver settlement → QBO Bill workflow needs vendor_uuid populated

SCOPE — ADDITIVE ONLY (no deletions, no renames):

PIECE A — Migration 0297
  ALTER TABLE master_data.drivers
    ADD COLUMN IF NOT EXISTS qbo_vendor_uuid UUID NULL,
    ADD COLUMN IF NOT EXISTS qbo_vendor_link_status TEXT 
      CHECK (qbo_vendor_link_status IN ('unlinked','linked','drift','manual_override'))
      DEFAULT 'unlinked',
    ADD COLUMN IF NOT EXISTS qbo_vendor_last_synced_at TIMESTAMPTZ NULL;
  ALTER TABLE master_data.units
    ADD COLUMN IF NOT EXISTS qbo_class_uuid UUID NULL,
    ADD COLUMN IF NOT EXISTS qbo_class_link_status TEXT
      CHECK (qbo_class_link_status IN ('unlinked','linked','drift','manual_override'))
      DEFAULT 'unlinked',
    ADD COLUMN IF NOT EXISTS qbo_class_last_synced_at TIMESTAMPTZ NULL;
  CREATE INDEX IF NOT EXISTS idx_drivers_qbo_vendor ON master_data.drivers(qbo_vendor_uuid);
  CREATE INDEX IF NOT EXISTS idx_units_qbo_class ON master_data.units(qbo_class_uuid);
  GRANT SELECT, INSERT, UPDATE ON master_data.drivers TO app_user;
  GRANT SELECT, INSERT, UPDATE ON master_data.units TO app_user;

PIECE B — Backend routes
  GET    /api/master-data/drivers/:uuid/qbo-vendor
  PATCH  /api/master-data/drivers/:uuid/qbo-vendor  (body: {qbo_vendor_uuid})
  POST   /api/master-data/drivers/:uuid/qbo-vendor/sync  (pulls latest from QBO mirror)
  GET    /api/master-data/units/:uuid/qbo-class
  PATCH  /api/master-data/units/:uuid/qbo-class  (body: {qbo_class_uuid})
  POST   /api/master-data/units/:uuid/qbo-class/sync
  All routes RLS-scoped per operating_company_id.
  All link/unlink events emit audit_event row with details.

PIECE C — Frontend DriverDetail tab
  Add 7th tab "Vendor (QBO)" to DriverDetail.tsx (after existing 6 tabs).
  QboVendorTab.tsx shows:
    - Current linked vendor (name, sync status badge, last sync timestamp)
    - "Re-sync from QBO" button
    - "Change vendor" → typeahead from qbo.vendors mirror
    - AP balance (read from qbo.vendor_balances mirror)
    - Audit log of link changes (last 10)

PIECE D — Frontend AssetDetail Class field
  Add "QBO Class" field block to AssetDetail.tsx general info section.
  QboClassField.tsx shows:
    - Typeahead picker bound to qbo.classes mirror
    - Sync status badge
    - "Re-sync from QBO" button

PIECE E — CI guard
  scripts/verify-qbo-vendor-driver-mapping.mjs:
    - Verifies migration columns exist
    - Verifies all 4 routes registered
    - Verifies tab/field rendered in DriverDetail.tsx + AssetDetail.tsx
    - Wired into verify:arch-design chain

PIECE F — Tests
  qbo-vendor-link.test.ts:
    - Link/unlink driver to vendor
    - Drift detection (vendor renamed in QBO)
    - RLS isolation (operating_company_id)
  qbo-class-link.test.ts: parallel tests for units

PIECE G — Docs
  docs/specs/gap-4-qbo-vendor-class-mapping.md:
    - Architecture decision
    - Schema reference
    - Sync model (TMS reads from qbo.* mirror; write-back is GAP-52 scope)

ACCEPTANCE:
[ ] Migration 0297 applied to prod via Render preDeploy
[ ] All 6 backend routes return 200/422 correctly
[ ] DriverDetail renders 7th "Vendor (QBO)" tab with all features
[ ] AssetDetail renders "QBO Class" field with typeahead
[ ] verify-qbo-vendor-driver-mapping.mjs in verify:arch-design chain
[ ] All 17 historical AUDIT-FIX + 32 CLOSURE + prior GAP blocks remain green
[ ] No deletions/renames (additive-only confirmed)

CI MUST PASS:
[ ] build:backend EMIT
[ ] frontend tsc -b
[ ] verify:arch-design (chain includes new guard)
[ ] vitest backend + frontend tests pass
[ ] block-ready.mjs EXIT=0 with .block-ready.json manifest matching allowed_files

PAUSE: if migration 0297 fails preDeploy on Render, STOP and report exact 
       SQLSTATE error. Do not retry.

POST-MERGE NEXT STEPS:
  - GAP-52 (Pass-2) will add drift detection worker that uses these columns
  - QBO Sync Track #6 T11.20.6.2 (write-back) consumes this in Cycle 5

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
