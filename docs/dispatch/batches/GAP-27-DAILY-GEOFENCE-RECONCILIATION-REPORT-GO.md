═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-27 — Daily Geofence Reconciliation Report
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-L  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-26 (Lane A) — same wave G-L

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-26 owned):
  apps/backend/src/integrations/samsara/border-crossings/**
  apps/backend/scripts/seed-border-geofences.mjs
  migrations/0310_border_crossing_events.sql

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/integrations/samsara/geofences/reconciliation.service.ts  (NEW)
  apps/backend/src/integrations/samsara/geofences/reconciliation.routes.ts   (NEW)
  apps/backend/src/integrations/samsara/geofences/__tests__/recon.test.ts    (NEW)
  apps/backend/src/jobs/geofence-reconciliation-daily.ts                     (NEW)
  apps/frontend/src/pages/reports/GeofenceReconciliationReport.tsx           (NEW)
  scripts/verify-geofence-recon.mjs                                          (NEW CI guard)
  docs/specs/gap-27-geofence-reconciliation.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT item · Geofence integrity audit · Detect orphan/duplicate/
        missing fence events daily so issues don't compound

PROBLEM: Geofence events fire from Samsara but no daily audit verifies:
  - Entered without exit (driver bypassed system)
  - Exit without entered (sensor glitch)
  - Duplicate fires (>1 entry within 60s)
  - Expected fires that didn't happen (load delivered but no delivery 
    geofence event)
Operators see surface issues but no integrity report.

SCOPE — ADDITIVE ONLY:

PIECE A — Reconciliation service
  reconciliation.service.ts:
    runDailyReconciliation(date) →
      Scans all geofence_events for date
      Detects 4 anomaly classes:
        1. orphan_entry (entry without exit, vehicle now elsewhere)
        2. orphan_exit (exit without prior entry)
        3. duplicate_fire (entry within 60s of another entry, same geofence)
        4. expected_missing (load delivered but no delivery geofence event)
      Persists findings to safety.integrity_findings table.

PIECE B — Worker
  geofence-reconciliation-daily.ts: runs at 02:00 CT each day.

PIECE C — Routes
  GET /api/integrations/samsara/geofences/reconciliation?date=
  GET /api/integrations/samsara/geofences/reconciliation/anomaly/:uuid

PIECE D — Frontend report
  GeofenceReconciliationReport.tsx (route /reports/geofence-reconciliation):
    Daily summary: # events, # anomalies by class
    Drill into anomalies, see vehicle + load + timestamp
    "Mark resolved" workflow + audit

PIECE E — CI guard
  verify-geofence-recon.mjs: worker registered, routes registered, 
    report page renders.

PIECE F — Tests
  recon.test.ts: each anomaly class detection, false-positive rate, 
    RLS isolation.

PIECE G — Docs
  docs/specs/gap-27-geofence-reconciliation.md

ACCEPTANCE:
[ ] Worker runs daily at 02:00 CT
[ ] All 4 anomaly classes detected
[ ] Report page renders findings
[ ] Resolve workflow audited
[ ] verify-geofence-recon.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if false-positive rate >10%, STOP — heuristics need tuning.

POST-MERGE NEXT STEPS: feeds Safety > Integrity Reports tab.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
