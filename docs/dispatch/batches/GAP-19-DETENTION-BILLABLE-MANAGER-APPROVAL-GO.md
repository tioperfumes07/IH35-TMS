═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-19 — Detention-Billable Trigger + Manager-Approval Workflow
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-H  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-18 (Lane A) — same wave G-H

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-18 owned):
  apps/backend/src/drivers/communication-log/**
  apps/frontend/src/components/drivers/DriverCommunicationLogTab.tsx
  apps/frontend/src/components/drivers/SendMessageDrawer.tsx
  migrations/0305_driver_communication_log.sql

ALLOWED FILES (disjoint from Lane A):
  migrations/0306_detention_requests.sql                                     (NEW)
  apps/backend/src/dispatch/loads/detention/detection.service.ts             (NEW)
  apps/backend/src/dispatch/loads/detention/request.service.ts               (NEW)
  apps/backend/src/dispatch/loads/detention/approval.service.ts              (NEW)
  apps/backend/src/dispatch/loads/detention/routes.ts                        (NEW)
  apps/backend/src/dispatch/loads/detention/__tests__/                       (NEW dir)
  apps/backend/src/jobs/detention-detector-worker.ts                         (NEW)
  apps/frontend/src/pages/dispatch/loads/DetentionRequest.tsx                (NEW)
  apps/frontend/src/components/dispatch/DetentionBadge.tsx                   (NEW)
  apps/frontend/src/pages/dispatch/DispatchBoard.tsx                         (EDIT — add badge col)
  scripts/verify-detention-flow.mjs                                          (NEW CI guard)
  docs/specs/gap-19-detention-billable.md                                    (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: WF-053 multi-stop extra_rate consolidation · GAP-32 customer
        free-time catalog feeds this · Detention revenue currently missed
        due to manual tracking · ChatGPT item #6

PROBLEM: When driver dwell at pickup/delivery exceeds customer's free-time
threshold (e.g. 2 hours), detention becomes billable. Currently no:
  - Auto-detection (dwell vs free-time comparison)
  - Manager approval workflow (per customer terms, may need override)
  - Auto-add to invoice (revenue captured)
Result: missed billable detention revenue + manual operator burden.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0306
  CREATE TABLE IF NOT EXISTS dispatch.detention_requests (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    load_uuid UUID NOT NULL,
    stop_uuid UUID NOT NULL,
    customer_uuid UUID NOT NULL,
    detected_at TIMESTAMPTZ NOT NULL,
    dwell_minutes INTEGER NOT NULL,
    free_time_minutes INTEGER NOT NULL,
    billable_minutes INTEGER NOT NULL,
    detention_rate_per_hour NUMERIC(8,2) NOT NULL,
    total_amount NUMERIC(10,2) NOT NULL,
    status TEXT CHECK (status IN ('pending_review','approved','rejected','invoiced')) NOT NULL,
    requested_by_user_uuid UUID,
    approved_by_user_uuid UUID,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    invoice_line_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_det_status ON dispatch.detention_requests(status);
  CREATE INDEX idx_det_customer ON dispatch.detention_requests(customer_uuid);
  GRANT SELECT, INSERT, UPDATE ON dispatch.detention_requests TO app_user;

PIECE B — Detector service
  detection.service.ts:
    detectDetentionEvents() →
      For each stop with departed_at NOT NULL AND arrived_at NOT NULL:
        Compute dwell_minutes = departed - arrived
        Look up customer free_time_minutes from catalog (GAP-32)
        If dwell > free_time:
          Auto-create detention_requests row with status='pending_review'

PIECE C — Background worker
  detention-detector-worker.ts: runs every 30min for recently-departed stops.

PIECE D — Approval service + routes
  approval.service.ts:
    approveRequest(uuid, manager_user_uuid) → 
      status='approved', emits WF-064 audit
      Auto-adds invoice_line to load's invoice
    rejectRequest(uuid, manager_user_uuid, reason) → 
      status='rejected', audit
  Routes:
    GET    /api/dispatch/detention/requests?status=pending_review
    PATCH  /api/dispatch/detention/requests/:uuid/approve (Manager+ role)
    PATCH  /api/dispatch/detention/requests/:uuid/reject  (Manager+ role)

PIECE E — Frontend
  DetentionRequest.tsx (review queue page /dispatch/detention):
    List pending requests, sortable by dwell hours
    Per-row: approve / reject buttons + reason field
  DetentionBadge.tsx: on dispatch board, shows detention pill on loads with 
    pending requests.
  DispatchBoard.tsx EDIT: add detention badge column.

PIECE F — CI guard
  verify-detention-flow.mjs: migration applied, worker registered, routes 
    registered, manager-only RBAC enforced.

PIECE G — Tests
  detection.test.ts: dwell calc, free-time lookup, auto-creation
  approval.test.ts: approve auto-adds invoice line, reject audited, RBAC, 
    RLS isolation

PIECE H — Docs
  docs/specs/gap-19-detention-billable.md (cite WF-053, GAP-32, WF-064)

ACCEPTANCE:
[ ] Migration 0306 applied
[ ] Detector runs every 30min
[ ] Pending requests appear in queue
[ ] Approve adds invoice line (revenue captured)
[ ] Reject audited with reason
[ ] verify-detention-flow.mjs in CI chain
[ ] Manager-only RBAC enforced

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if detection produces >0 false positives in test data (dwell wrongly
       flagged), STOP — free-time catalog (GAP-32) integrity check needed.

POST-MERGE NEXT STEPS: depends on GAP-32 (customer free_time catalog) for
       per-customer thresholds. If GAP-32 not yet shipped, use default 120min.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
