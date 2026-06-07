═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-49 — Maintenance Pre-Flight DVIR Tagging (Major vs Minor)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-W  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-48 (Lane A) — same wave G-W

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-48 owned):
  apps/backend/src/master-data/drivers/operations-depth/**
  apps/frontend/src/pages/drivers/operations/**
  apps/frontend/src/components/drivers/OperationsDepthNav.tsx

ALLOWED FILES (disjoint from Lane A):
  migrations/0320_dvir_defect_severity_tagging.sql                           (NEW)
  apps/backend/src/maintenance/pre-flight/dvir-severity.service.ts           (NEW)
  apps/backend/src/maintenance/pre-flight/dvir-routing.service.ts            (NEW)
  apps/backend/src/maintenance/pre-flight/routes.ts                          (NEW)
  apps/backend/src/maintenance/pre-flight/__tests__/                         (NEW dir)
  apps/backend/src/maintenance/pre-flight/major-defect-catalog.ts            (NEW)
  apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx      (NEW)
  apps/frontend/src/components/maintenance/DvirSeverityBadge.tsx             (NEW)
  apps/frontend/src/pages/maintenance/work-orders/WorkOrderDetail.tsx        (EDIT — show severity)
  apps/driver-pwa/src/screens/PreTripDvir.tsx                                (EDIT — severity picker)
  scripts/verify-dvir-severity-tagging.mjs                                   (NEW CI guard)
  docs/specs/gap-49-dvir-severity-tagging.md                                 (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G18 master rule · WF-050 hard-block requires severity tagging to 
        distinguish major (block dispatch) from minor (warning/log only) · 
        49 CFR §396.11 DVIR severity classifications

PROBLEM: Drivers submit DVIRs via PWA but defects are not tagged with 
severity. Per 49 CFR §396.11:
  - MAJOR defect = vehicle UNSAFE to operate → dispatch BLOCKED
  - MINOR defect = note for next service → dispatch ALLOWED
WF-050 hard-block exists in backend but fires on ANY defect, even minor 
ones like "wiper streaks" — false dispatch lockouts. Operators bypass via 
"resolve" workflow without actual fix → safety risk.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0320
  CREATE TYPE dvir_severity AS ENUM ('major','minor','observation');
  ALTER TABLE safety.dvir_defects
    ADD COLUMN IF NOT EXISTS severity dvir_severity DEFAULT 'minor',
    ADD COLUMN IF NOT EXISTS major_defect_code TEXT,
    ADD COLUMN IF NOT EXISTS auto_wo_uuid UUID REFERENCES maintenance.work_orders(uuid);
  CREATE INDEX idx_dvir_severity ON safety.dvir_defects(severity);
  GRANT SELECT, UPDATE ON safety.dvir_defects TO app_user;

PIECE B — Major defect catalog (locked per 49 CFR §396.11)
  major-defect-catalog.ts:
    export const MAJOR_DEFECT_CODES = [
      { code: 'BRAKE_AIR_LEAK',      label: 'Air brake system leak', cfr: '396.11(a)(2)' },
      { code: 'BRAKE_PADS_WORN',     label: 'Brake pads below 1/8"', cfr: '396.11(a)(2)' },
      { code: 'STEERING_LOOSE',      label: 'Steering wheel free play >10deg', cfr: '396.11(a)(3)' },
      { code: 'TIRE_FLAT',           label: 'Tire flat or below tread depth', cfr: '396.11(a)(4)' },
      { code: 'TIRE_SIDEWALL',       label: 'Tire sidewall damage exposed cord', cfr: '396.11(a)(4)' },
      { code: 'LIGHTS_HEADLIGHT',    label: 'Headlight inoperative', cfr: '396.11(a)(5)' },
      { code: 'COUPLING_FIFTH_WHEEL',label: 'Fifth wheel coupling damaged', cfr: '396.11(a)(6)' },
      { code: 'COUPLING_KING_PIN',   label: 'King pin worn / cracked', cfr: '396.11(a)(6)' },
      { code: 'FUEL_LEAK',           label: 'Fuel system leak', cfr: '396.11(a)(8)' },
      { code: 'EXHAUST_LEAK',        label: 'Exhaust system leak into cab', cfr: '396.11(a)(9)' },
      { code: 'WINDSHIELD_BROKEN',   label: 'Windshield cracked in driver view', cfr: '396.11(a)(10)' },
      { code: 'WINDSHIELD_WIPERS',   label: 'Windshield wipers inoperative', cfr: '396.11(a)(11)' },
      // ... full catalog from CFR
    ];

PIECE C — Severity service
  dvir-severity.service.ts:
    classifyDefect(defect_description, defect_category) → 
      Heuristic + catalog match → severity + code (if major)
    setSeverity(defect_uuid, severity, major_code, user_uuid) → 
      Audit-tracked override (Manager+ role required for major↔minor change)

PIECE D — Routing service
  dvir-routing.service.ts:
    routeDefect(defect_uuid) →
      If severity='major': auto-create maintenance.work_orders priority=major
      If severity='minor': add to unit's next-PM service queue (no immediate WO)
      If severity='observation': log only, no WO

PIECE E — Routes
  GET   /api/maintenance/pre-flight/dvir-queue?severity=&status=
  PATCH /api/maintenance/pre-flight/defects/:uuid/severity 
        (Manager+ role for major flips)
  GET   /api/maintenance/pre-flight/major-defect-catalog

PIECE F — Frontend (dispatcher)
  PreFlightDvirQueue.tsx (/maintenance/pre-flight/dvir):
    Tabbed by severity: Major (red, top priority), Minor (amber), Observations
    Per row: defect details, WO link if auto-created, severity override action
  DvirSeverityBadge.tsx: badge component used in WO detail, dispatch board
  WorkOrderDetail.tsx EDIT: show severity badge + linked DVIR defect

PIECE G — Driver PWA edit
  PreTripDvir.tsx EDIT:
    For each defect added: present severity picker (Major / Minor / Observation)
    Default: Minor (safer)
    If Major selected: show warning "This will block dispatch until repaired" 
      with WF-064-style confirmation

PIECE H — CI guard
  verify-dvir-severity-tagging.mjs: migration applied, catalog locked, 
    routes registered, queue page + badge component + PWA picker present.

PIECE I — Tests
  dvir-severity.test.ts: classifier accuracy, override audit, RBAC
  dvir-routing.test.ts: auto-WO creation on major, no-WO on minor, RLS

PIECE J — Docs
  docs/specs/gap-49-dvir-severity-tagging.md (cite G18, WF-050, 49 CFR §396.11)

ACCEPTANCE:
[ ] Migration 0320 applied
[ ] Catalog seeded with major defect codes from CFR
[ ] Driver PWA shows severity picker
[ ] Major defects auto-create maintenance WOs
[ ] WF-050 blocks dispatch only on MAJOR defects (not minor)
[ ] Manager+ role enforced on major↔minor severity changes
[ ] verify-dvir-severity-tagging.mjs in CI chain
[ ] No regression on existing WF-050 enforcement (still blocks; just on majors)

CI MUST PASS: build:backend EMIT · frontend tsc -b · driver-pwa tsc -b · 
              verify:arch-design · vitest pass · block-ready.mjs EXIT=0

PAUSE: if classifier mis-classifies known-major defects as minor in test set, 
       STOP — driver safety + DOT compliance liability.

POST-MERGE NEXT STEPS: feeds Maintenance Arriving Soon queue (GAP-17) 
       priority sort. Engine fault auto-WO (GAP-58) uses same severity model.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
