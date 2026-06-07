═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-9 — G27/G28 Workers Comp Tab + HOS Clocks/Violations Split
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-D  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-10 (Lane B) — same wave G-D

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-10 owned):
  apps/backend/src/dispatch/loads/cancel/**
  apps/frontend/src/components/dispatch/CancelLoadModal.tsx
  migrations/0300_cancel_reasons_catalog.sql

ALLOWED FILES (disjoint from Lane B):
  migrations/0299_safety_workers_comp_hos_split.sql                         (NEW)
  apps/backend/src/safety/workers-comp/workers-comp.routes.ts               (NEW)
  apps/backend/src/safety/workers-comp/workers-comp.service.ts              (NEW)
  apps/backend/src/safety/hos/hos-clocks.routes.ts                          (NEW)
  apps/backend/src/safety/hos/hos-violations.routes.ts                      (NEW)
  apps/backend/src/safety/__tests__/workers-comp.test.ts                    (NEW)
  apps/backend/src/safety/__tests__/hos-split.test.ts                       (NEW)
  apps/frontend/src/pages/safety/workers-comp/WorkersCompTab.tsx            (NEW)
  apps/frontend/src/pages/safety/hos/HosClocksTab.tsx                       (NEW — split)
  apps/frontend/src/pages/safety/hos/HosViolationsTab.tsx                   (NEW — split)
  apps/frontend/src/components/safety/SafetyGroupNav.tsx                    (EDIT — add tabs to nav)
  scripts/verify-safety-tab-count.mjs                                       (NEW CI guard)
  docs/specs/gap-9-workers-comp-hos-split.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G27 + G28 master rules (restored 2026-05-07) · Safety = 21 sub-tabs / 
        8 groups per Jorge spec · existing v5 had Workers Comp removed in 
        prior refactor, must restore additive-only

PROBLEM: Safety module currently has 19 tabs / 6-7 groups (varies by view). 
G27 requires Workers Comp restored (Group 1 Driver Files & Training or new 
Group). G28 requires splitting "Hours of Service" into TWO separate tabs:
HOS Clocks (live driver clocks from Samsara) vs HOS Violations (separate 
violation log cross-linked to clocks).

SCOPE — ADDITIVE ONLY (per Locked Invariant: NEVER REMOVE tabs/routes):

PIECE A — Migration 0299
  CREATE TABLE IF NOT EXISTS safety.workers_comp_policies (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    carrier_name TEXT NOT NULL,
    policy_number TEXT NOT NULL,
    effective_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    annual_premium NUMERIC(12,2),
    deductible NUMERIC(10,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS safety.workers_comp_claims (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    policy_uuid UUID REFERENCES safety.workers_comp_policies(uuid),
    driver_uuid UUID,
    claim_number TEXT,
    incident_date DATE NOT NULL,
    status TEXT CHECK (status IN ('open','approved','denied','closed','litigation')),
    amount_claimed NUMERIC(12,2),
    amount_paid NUMERIC(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS idx_wc_claims_driver ON safety.workers_comp_claims(driver_uuid);
  GRANT SELECT, INSERT, UPDATE ON safety.workers_comp_policies, safety.workers_comp_claims TO app_user;

PIECE B — Backend routes
  Workers Comp:
    GET    /api/safety/workers-comp/policies
    POST   /api/safety/workers-comp/policies
    PATCH  /api/safety/workers-comp/policies/:uuid
    GET    /api/safety/workers-comp/claims
    POST   /api/safety/workers-comp/claims
  HOS split:
    GET    /api/safety/hos/clocks    (existing /api/safety/hos kept as alias)
    GET    /api/safety/hos/violations (NEW — pulls from samsara.hos_violations mirror)

PIECE C — Frontend tabs
  WorkersCompTab.tsx: policy list + claims list + "+ Create Policy" + "+ Create Claim".
  HosClocksTab.tsx: split from current HOS tab — live driver clocks panel only.
  HosViolationsTab.tsx: NEW — violation log table cross-linked to clocks.
  SafetyGroupNav.tsx: 
    - Group 1 "Driver Files & Training": add Workers Comp tab (additive)
    - Group 2 "Hours & Fatigue": split HOS into HOS Clocks + HOS Violations
    - Total tabs: 19 → 21 (additive, +2 new tabs, no removal)

PIECE D — CI guard
  verify-safety-tab-count.mjs:
    - Reads SafetyGroupNav.tsx
    - Counts groups (must = 8) and tabs (must = 21)
    - Verifies tab IDs match locked list per G27/G28
    - Wired into verify:arch-design

PIECE E — Tests
  workers-comp.test.ts: policy CRUD, claim CRUD, RLS isolation
  hos-split.test.ts: clocks endpoint, violations endpoint, no overlap

PIECE F — Docs
  docs/specs/gap-9-workers-comp-hos-split.md

ACCEPTANCE:
[ ] Migration 0299 applied
[ ] All 7 routes return correct data
[ ] Workers Comp tab renders with policies + claims
[ ] HOS Clocks tab shows live data
[ ] HOS Violations tab shows separate violation log
[ ] Safety total = 21 tabs / 8 groups verified by CI guard
[ ] Existing HOS route still works (no regression for legacy consumers)

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if tab count guard returns != 21/8, STOP — Jorge directive G27/G28 
       sets exact count.

POST-MERGE NEXT STEPS: GAP-60 (CAP-10 Driver scoring) adds a 22nd tab in 
                       Group 1 — that's a separate dispatch, not this one.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
