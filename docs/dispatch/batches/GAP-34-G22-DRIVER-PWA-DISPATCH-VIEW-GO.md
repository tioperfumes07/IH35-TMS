═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-34 — G22 Driver PWA Dispatch View
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-P  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-35 (Lane B) — same wave G-P

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-35 owned):
  apps/driver-pwa/src/screens/LoadTrueStatus.tsx
  apps/backend/src/dispatch/loads/true-status/**

ALLOWED FILES (disjoint from Lane B):
  apps/driver-pwa/src/screens/DispatchView.tsx                                 (NEW)
  apps/driver-pwa/src/components/dispatch/PickupCard.tsx                       (NEW)
  apps/driver-pwa/src/components/dispatch/DeliveryCard.tsx                     (NEW)
  apps/driver-pwa/src/components/dispatch/DocUploadDrawer.tsx                  (NEW)
  apps/driver-pwa/src/lib/dispatch-api-client.ts                               (NEW)
  apps/driver-pwa/src/screens/__tests__/dispatch-view.test.tsx                 (NEW)
  apps/backend/src/dispatch/driver-pwa/dispatch-view.routes.ts                 (NEW)
  apps/backend/src/dispatch/driver-pwa/__tests__/dispatch-view.test.ts         (NEW)
  scripts/verify-driver-pwa-dispatch-view.mjs                                  (NEW CI guard)
  docs/specs/gap-34-driver-pwa-dispatch.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G22 master rule · Driver PWA needs pickup/delivery view with doc upload · 
        Currently driver PWA has Today/Loads/Earnings/More but no dedicated 
        dispatch interaction screen

PROBLEM: Driver on PWA cannot:
  - See structured pickup/delivery details (address, contact, hours, instructions)
  - Upload BOL/POD photos directly tied to that stop
  - Mark stop arrival/departure with structured input
Driver must call dispatch for everything → dispatcher burden + delays.

SCOPE — ADDITIVE ONLY:

PIECE A — Backend routes
  dispatch-view.routes.ts:
    GET /api/dispatch/driver-pwa/load/:uuid/dispatch-view
       Returns: stops[], pickup_contact, delivery_contact, special_instructions,
                doc_requirements (BOL needed at pickup, POD at delivery), 
                geofence_status (entered/exited per stop)
    POST /api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/arrival
    POST /api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/departure
    POST /api/dispatch/driver-pwa/load/:uuid/stops/:stop_uuid/document
       body: {evidence_uuid, doc_type} (consumes GAP-11 widget)
    All routes RLS-scoped to driver's assigned loads only.

PIECE B — Frontend DispatchView
  DispatchView.tsx (new PWA screen, accessible from Today + Loads):
    Header: load number + customer + status pill
    Pickup section: PickupCard with address/contact/hours/special-instr
    Delivery section: DeliveryCard (multiple if multi-stop)
    Each card has: Arrived button · Departed button · Upload doc button
    Status badge per stop: pending → arrived → docs uploaded → departed

PIECE C — Cards
  PickupCard.tsx + DeliveryCard.tsx:
    Address with "Open in maps" link
    Contact name + click-to-call
    Scheduled window + actual arrival/departure timestamps once recorded
    Doc requirements checklist (BOL / POD / lumper receipt)
    Notes from dispatcher

PIECE D — Doc upload drawer
  DocUploadDrawer.tsx: 
    Uses driver phone camera or file picker
    Posts to evidence_create R2 pattern
    Attaches evidence_uuid to stop via POST /document route
    Shows thumbnail confirmation

PIECE E — Client lib
  dispatch-api-client.ts: typed fetch wrappers for above routes.

PIECE F — CI guard
  verify-driver-pwa-dispatch-view.mjs: routes registered + screen exists + 
    PWA route /dispatch/:load_uuid resolves.

PIECE G — Tests
  dispatch-view.test.ts (backend): RLS isolation (driver A can't see driver B's 
    loads), arrival/departure flow, doc upload chain.
  dispatch-view.test.tsx (PWA): renders cards, doc upload opens drawer.

PIECE H — Docs
  docs/specs/gap-34-driver-pwa-dispatch.md (cite G22, GAP-11 widget reuse)

ACCEPTANCE:
[ ] Driver sees DispatchView for their assigned loads
[ ] Driver can mark arrival/departure per stop
[ ] Driver can upload doc per stop using R2 evidence pattern
[ ] RLS prevents cross-driver visibility
[ ] verify-driver-pwa-dispatch-view.mjs in CI chain
[ ] No regression on existing Today/Loads/Earnings screens

CI MUST PASS: build:backend EMIT · driver-pwa tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if RLS test allows cross-driver visibility, STOP — privacy violation.

POST-MERGE NEXT STEPS: GAP-35 (true-status page) consumes the same 
       stop-action data to show driver the load lifecycle progression.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
