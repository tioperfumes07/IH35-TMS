═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-48 — Driver Operations Depth (12 Sub-Views)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-W  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-49 (Lane B) — same wave G-W

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-49 owned):
  apps/backend/src/maintenance/pre-flight/**
  apps/frontend/src/pages/maintenance/pre-flight/**

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/master-data/drivers/operations-depth/                      (NEW dir)
    debt-history.service.ts
    payroll-history.service.ts
    escrow-history.service.ts
    permit-history.service.ts
    accident-history.service.ts
    settlement-history.service.ts
    fuel-history.service.ts
    maintenance-assignments.service.ts
    safety-events.service.ts
    communications-log.service.ts
    pwa-engagement.service.ts
    documents-vault.service.ts
  apps/backend/src/master-data/drivers/operations-depth/routes.ts            (NEW)
  apps/backend/src/master-data/drivers/operations-depth/__tests__/           (NEW dir)
  apps/frontend/src/pages/drivers/operations/                                 (NEW dir, 12 files)
  apps/frontend/src/components/drivers/OperationsDepthNav.tsx                (NEW)
  apps/frontend/src/pages/drivers/DriverDetail.tsx                            (EDIT — add Operations tab)
  scripts/verify-driver-operations-depth.mjs                                 (NEW CI guard)
  docs/specs/gap-48-driver-operations-depth.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G33 + recurring Jorge directive — driver profile too shallow · 
        need full operational history surface for Owner + Safety decisions

PROBLEM: DriverDetail today shows 6 tabs (Overview / Loads / Earnings / 
Compliance / Documents / Vendor QBO via GAP-4). Owner needs 12 sub-views 
of driver operational depth on a separate "Operations" tab:
  1. Debt history (all driver_liabilities + repayment)
  2. Payroll history (settlements)
  3. Escrow history (deposits / forfeitures / releases)
  4. Permit history (CDL/medical/state permits + expiry)
  5. Accident history (cross-link to incidents)
  6. Settlement history (per settlement summary + drill)
  7. Fuel history (per-driver fuel txns)
  8. Maintenance assignments history (which trucks driven, WO history)
  9. Safety events (DVIR, harsh-brake, speeding from Samsara)
  10. Communications log (from GAP-18 driver comm)
  11. PWA engagement (login frequency, acceptance rate)
  12. Documents vault (all docs uploaded for this driver)

SCOPE — ADDITIVE ONLY:

PIECE A — Per-sub-view services
  12 services in operations-depth/ directory, each:
    getForDriver(driver_uuid, opts) → structured data + paging
    All RLS-scoped per operating_company_id.

PIECE B — Routes
  GET /api/drivers/:uuid/operations/debt-history
  GET /api/drivers/:uuid/operations/payroll-history
  ... (12 routes, one per sub-view)

PIECE C — Frontend
  DriverDetail.tsx EDIT: add 7th tab "Operations" (after Vendor QBO from GAP-4)
  OperationsDepthNav.tsx: secondary nav with 12 sub-views (hover-dropdown 
    pattern per G3)
  operations/ dir: 12 page components, one per sub-view

PIECE D — CI guard
  verify-driver-operations-depth.mjs: all 12 routes registered, 12 page 
    files exist, OperationsDepthNav lists all 12.

PIECE E — Tests
  Per-service unit tests: data retrieval accuracy, paging, RLS
  Operations tab renders + nav works

PIECE F — Docs
  docs/specs/gap-48-driver-operations-depth.md

ACCEPTANCE:
[ ] All 12 services return correct data
[ ] All 12 sub-views render in /drivers/:uuid/operations
[ ] Hover-dropdown nav works
[ ] Operations tab added to DriverDetail (additive, no tab removal)
[ ] verify-driver-operations-depth.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any sub-view query times out (>2s on large drivers), STOP — 
       add indexes or paging before deploy.

POST-MERGE NEXT STEPS: pattern reusable for Unit operations depth + Customer 
       operations depth (similar deep dives).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
