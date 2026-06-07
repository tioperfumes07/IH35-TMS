═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-58 — CAP-8 Engine Diagnostic Fault → Auto WO Creation
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-D  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-57 (Lane A) — same wave P2-D

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-57 owned):
  apps/backend/src/dispatch/load-status-signal/**
  apps/frontend/src/components/dispatch/TriSignalPill.tsx
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/integrations/samsara/engine-faults/fault-handler.service.ts (NEW)
  apps/backend/src/integrations/samsara/engine-faults/routes.ts             (NEW webhook)
  apps/backend/src/integrations/samsara/engine-faults/__tests__/            (NEW)
  apps/backend/src/integrations/samsara/engine-faults/severe-fault-catalog.ts (NEW)
  apps/backend/src/maintenance/work-orders/auto-create-from-fault.ts        (NEW)
  apps/backend/src/notifications/fault-notifications.ts                     (NEW)
  migrations/0302_engine_fault_events.sql                                   (NEW)
  scripts/verify-cap-8-engine-fault-auto-wo.mjs                             (NEW CI guard)
  docs/specs/gap-58-cap-8-engine-fault-auto-wo.md                           (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CAP-8 from Samsara Capabilities · "Severe fault codes trigger WO 
        creation. New." · J1939 SPN codes from Samsara webhooks

PROBLEM: Samsara reports engine diagnostic faults via webhook today, but 
no automated WO creation happens. Severe faults (engine overheat, brake 
warning, transmission failure) require human to manually create WO, often 
hours after the fault event.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0302
  CREATE TABLE IF NOT EXISTS integrations.engine_fault_events (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    vehicle_id TEXT NOT NULL,
    samsara_event_id TEXT UNIQUE,
    spn_code INTEGER NOT NULL,
    fmi_code INTEGER,
    severity TEXT CHECK (severity IN ('info','warn','severe','critical')) NOT NULL,
    raw_payload JSONB NOT NULL,
    auto_wo_uuid UUID NULL REFERENCES maintenance.work_orders(uuid),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    handled_at TIMESTAMPTZ NULL
  );
  CREATE INDEX idx_fault_events_vehicle ON integrations.engine_fault_events(vehicle_id);
  CREATE INDEX idx_fault_events_received ON integrations.engine_fault_events(received_at DESC);
  GRANT SELECT, INSERT ON integrations.engine_fault_events TO app_user;

PIECE B — Severe fault catalog
  severe-fault-catalog.ts:
    Locked list of J1939 SPN codes that trigger auto-WO:
      - SPN 110 (engine coolant temp critical)
      - SPN 100 (engine oil pressure low)
      - SPN 190 (engine speed)
      - SPN 1569 (DEF tank empty)
      - SPN 974 (brake system warning)
      - SPN 191 (transmission output speed major)
      - ... (full catalog with severity)

PIECE C — Fault handler service
  fault-handler.service.ts:
    handleFaultEvent(payload) →
      Persist to engine_fault_events.
      If severity in (severe, critical):
        - Call auto-create-from-fault.ts → creates WO type='engine_diagnostic'
        - Notify Maintenance role + Driver via PWA
        - Link auto_wo_uuid back to event
      If warn: log only, surface in safety integrity report.

PIECE D — Webhook route
  routes.ts:
    POST /api/integrations/samsara/engine-faults/webhook
    Verifies Samsara webhook signature.
    Idempotent: ON CONFLICT samsara_event_id DO NOTHING.

PIECE E — Auto-create WO
  auto-create-from-fault.ts:
    Creates maintenance.work_orders row with:
      type='engine_diagnostic', priority='severe', 
      fault_code (new column on WO — migration 0302 also adds it), 
      description auto-populated from catalog.

PIECE F — Notifications
  fault-notifications.ts: dispatches via existing Twilio + Resend pattern.

PIECE G — CI guard
  verify-cap-8-engine-fault-auto-wo.mjs: webhook route registered, 
    catalog locked, auto-WO logic enforced.

PIECE H — Tests
  fault-handler.test.ts: severe code → WO created, warn → no WO but logged, 
    idempotency, signature validation, RLS isolation.

PIECE I — Docs
  docs/specs/gap-58-cap-8-engine-fault-auto-wo.md

ACCEPTANCE:
[ ] Migration 0302 applied
[ ] Webhook accepts Samsara payloads + verifies signature
[ ] Severe fault → WO created within 30s
[ ] WO linked back to fault event
[ ] Driver + Maintenance notified
[ ] verify-cap-8-engine-fault-auto-wo.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Samsara webhook signature verification fails in test, STOP — 
       must be correct before accepting prod webhooks.

POST-MERGE NEXT STEPS: feeds maintenance home "Arriving Soon Needs 
                       Service" priority queue (GAP-17).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
