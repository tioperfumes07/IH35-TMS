═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-37 — G14 Equipment Dual-Confirm Transfer (Full WF-047)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-Q  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-36 (Lane A) — same wave G-Q

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-36 owned):
  apps/driver-pwa/src/screens/IncidentReport.tsx
  apps/driver-pwa/src/components/incident/**
  apps/backend/src/safety/incidents/**

ALLOWED FILES (disjoint from Lane A):
  migrations/0314_equipment_transfer_requests.sql                            (NEW)
  apps/backend/src/dispatch/equipment-transfer/request.service.ts            (NEW)
  apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts       (NEW)
  apps/backend/src/dispatch/equipment-transfer/routes.ts                     (NEW)
  apps/backend/src/dispatch/equipment-transfer/__tests__/                    (NEW dir)
  apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx           (NEW)
  apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx             (NEW)
  apps/driver-pwa/src/components/equipment/IncomingTransferRequest.tsx       (NEW)
  scripts/verify-equipment-transfer-dual-confirm.mjs                         (NEW CI guard)
  docs/specs/gap-37-equipment-dual-confirm-transfer.md                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G14 master rule + WF-047 · Equipment transfer between drivers 
        currently single-side action (assigning dispatcher updates DB) · 
        Audit trail weak · Both drivers should confirm physical handoff

PROBLEM: When trailer is dropped at yard for another driver to pick up, 
current flow just updates assignment in DB. No:
  - Outbound driver confirms drop (with photo + location)
  - Inbound driver confirms pickup (with photo + verification)
  - Window of accountability ambiguous if damage discovered
WF-047 spec requires dual confirmation with audit chain.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0314
  CREATE TABLE IF NOT EXISTS dispatch.equipment_transfer_requests (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    equipment_uuid UUID NOT NULL,
    equipment_kind TEXT CHECK (equipment_kind IN ('truck','trailer','chassis')) NOT NULL,
    from_driver_uuid UUID,
    to_driver_uuid UUID,
    initiated_by_user_uuid UUID NOT NULL,
    transfer_location TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending_outbound','outbound_confirmed','inbound_confirmed','completed','cancelled')) NOT NULL,
    outbound_confirmed_at TIMESTAMPTZ,
    outbound_evidence_uuid UUID,
    inbound_confirmed_at TIMESTAMPTZ,
    inbound_evidence_uuid UUID,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_etr_equipment ON dispatch.equipment_transfer_requests(equipment_uuid);
  CREATE INDEX idx_etr_status ON dispatch.equipment_transfer_requests(status);
  GRANT SELECT, INSERT, UPDATE ON dispatch.equipment_transfer_requests TO app_user;

PIECE B — Service
  request.service.ts:
    initiateTransfer({equipment_uuid, from_driver, to_driver, location}) → uuid
    listPendingForDriver(driver_uuid, direction) → requests
  dual-confirm.service.ts:
    confirmOutbound(request_uuid, driver_uuid, evidence_uuid) → 
      Validates driver == from_driver, status update, audit event
    confirmInbound(request_uuid, driver_uuid, evidence_uuid) → 
      Validates driver == to_driver, sets status='completed', 
      Re-assigns equipment.current_driver = to_driver
      audit chain with both confirmations linked

PIECE C — Routes
  POST   /api/dispatch/equipment-transfers/initiate
  POST   /api/dispatch/equipment-transfers/:uuid/confirm-outbound
  POST   /api/dispatch/equipment-transfers/:uuid/confirm-inbound
  GET    /api/dispatch/equipment-transfers/pending?driver=&direction=
  POST   /api/dispatch/equipment-transfers/:uuid/cancel

PIECE D — Frontend (dispatcher)
  EquipmentTransferModal.tsx: initiate flow in dispatcher dashboard
  EquipmentTransferRequests.tsx (/dispatch/equipment-transfers):
    Queue of in-progress transfers, status per request, audit drill-down

PIECE E — Driver PWA component
  IncomingTransferRequest.tsx: shows in driver's Today screen when:
    - Transfer where driver is from_driver, status=pending_outbound (drop confirm)
    - Transfer where driver is to_driver, status=outbound_confirmed (pickup confirm)
    Each opens photo+confirm modal that calls confirm-outbound/inbound routes.

PIECE F — CI guard
  verify-equipment-transfer-dual-confirm.mjs: migration applied, all 5 routes 
    registered, modal + PWA component present, dual-confirm flow enforced.

PIECE G — Tests
  request.test.ts: initiation, listing, cancellation
  dual-confirm.test.ts: outbound/inbound flow, driver mismatch rejection, 
    audit chain integrity, RLS

PIECE H — Docs
  docs/specs/gap-37-equipment-dual-confirm-transfer.md (cite G14, WF-047)

ACCEPTANCE:
[ ] Migration 0314 applied
[ ] Dispatcher can initiate transfer
[ ] Outbound driver confirms drop with evidence
[ ] Inbound driver confirms pickup with evidence
[ ] Equipment assignment auto-updates after inbound confirmation
[ ] Wrong-driver confirmation rejected
[ ] verify-equipment-transfer-dual-confirm.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · driver-pwa tsc -b · 
              verify:arch-design · vitest pass · block-ready.mjs EXIT=0

PAUSE: if wrong-driver confirmation rejection test fails, STOP — 
       authorization gap.

POST-MERGE NEXT STEPS: integrates with GAP-38 damage continuity 
       (damage discovered at inbound triggers WF-027).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
