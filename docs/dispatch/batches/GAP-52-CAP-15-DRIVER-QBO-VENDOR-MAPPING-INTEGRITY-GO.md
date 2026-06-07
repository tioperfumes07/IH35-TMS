═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-CRITICAL / TASK GAP-52 — CAP-15 Driver ↔ QBO Vendor Mapping Integrity
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-A  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-51 (Lane A) — same wave P2-A

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-51 owned):
  apps/backend/src/integrations/qbo/mirror-integrity.service.ts
  apps/backend/src/integrations/qbo/reconciliation-report.service.ts
  apps/backend/src/integrations/samsara/**
  migrations/0301_qbo_reconciliation_alerts.sql

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/integrations/integrity-monitors/driver-vendor-mapping.ts  (NEW)
  apps/backend/src/integrations/integrity-monitors/driver-vendor-mapping.routes.ts (NEW)
  apps/backend/src/integrations/integrity-monitors/__tests__/mapping.test.ts (NEW)
  apps/frontend/src/pages/safety/integrity-reports/DriverVendorMappingTab.tsx (NEW)
  apps/backend/src/jobs/driver-vendor-mapping-worker.ts                      (NEW worker)
  scripts/verify-driver-vendor-mapping-monitor.mjs                           (NEW CI guard)
  docs/specs/gap-52-driver-vendor-mapping-integrity.md                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-15 from Samsara Capabilities sheet (locked 2026-05-20) · 
        "Existing 'integrity report page' supposedly handles this. Need to 
        verify." · Different scope from GAP-4 (UI tabs); this is the 
        background drift detector

PROBLEM: When a driver's Samsara identity is mapped to a QBO vendor (via 
GAP-4), the mapping can drift if:
  - QBO vendor renamed/merged
  - Samsara driver re-created with new ID
  - Manual override applied incorrectly
Result: settlements bill the WRONG QBO vendor → financial misattribution. 
No automated detection today.

SCOPE — ADDITIVE ONLY:

PIECE A — Integrity monitor service
  driver-vendor-mapping.ts:
    checkAllMappings() →
      For each master_data.drivers row where qbo_vendor_uuid IS NOT NULL:
        - Read qbo.vendors mirror by qbo_vendor_uuid
        - Verify display_name match (fuzzy: Levenshtein <= 3)
        - Verify samsara_driver_id consistency
        - Flag if drift_detected
      Returns [{driver_uuid, qbo_vendor_uuid, drift_reason, severity}, ...]

PIECE B — Routes
  GET  /api/integrations/integrity/driver-vendor-mapping (latest snapshot)
  POST /api/integrations/integrity/driver-vendor-mapping/scan (manual trigger)

PIECE C — Background worker
  driver-vendor-mapping-worker.ts:
    Runs every 24h.
    Calls checkAllMappings(), persists results to 
    safety.integrity_findings table (existing).
    Notify Owner + Accounting role on any 'critical' severity finding.

PIECE D — Frontend tab
  DriverVendorMappingTab.tsx: new tab in Safety > Integrity Reports group.
    Renders findings list with severity + drift reason + recommended action.
    Operator can: ack finding, override mapping, schedule QBO sync re-pull.

PIECE E — CI guard
  verify-driver-vendor-mapping-monitor.mjs: worker registered in jobs, 
    routes registered, tab rendered in Safety > Integrity Reports.

PIECE F — Tests
  mapping.test.ts: each drift type, fuzzy matching, severity classification, 
    notification fires.

PIECE G — Docs
  docs/specs/gap-52-driver-vendor-mapping-integrity.md

ACCEPTANCE:
[ ] Worker runs daily + persists findings
[ ] Findings surface in Safety > Integrity Reports > Driver-Vendor Mapping
[ ] Notification fires on critical
[ ] Override flow audited
[ ] verify-driver-vendor-mapping-monitor.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if fuzzy match Levenshtein threshold too loose (false positives) or 
       too tight (missed drift), STOP — empirically validate with prod sample.

POST-MERGE NEXT STEPS: prevents wrong-person-billed settlements; informs 
settlement-creation pre-check (could extend GAP-15).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
