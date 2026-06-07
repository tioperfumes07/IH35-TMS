═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-85 — Permit + Toll Tag Tracking
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-R  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-86 (Lane B) — same wave P2-R

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-86 owned):
  apps/backend/src/insurance/policies-claims/**
  apps/frontend/src/pages/insurance/**

ALLOWED FILES (disjoint from Lane B):
  migrations/0329_permits_toll_tags.sql                                      (NEW)
  apps/backend/src/master-data/units/permits/service.ts                      (NEW)
  apps/backend/src/master-data/units/permits/routes.ts                       (NEW)
  apps/backend/src/master-data/units/permits/__tests__/                      (NEW)
  apps/backend/src/master-data/units/toll-tags/service.ts                    (NEW)
  apps/backend/src/master-data/units/toll-tags/routes.ts                     (NEW)
  apps/frontend/src/pages/units/UnitPermitsTab.tsx                           (NEW)
  apps/frontend/src/pages/units/UnitTollTagsTab.tsx                          (NEW)
  apps/frontend/src/pages/units/UnitDetail.tsx                               (EDIT — add tabs)
  scripts/verify-permits-toll-tags.mjs                                       (NEW CI guard)
  docs/specs/gap-85-permits-toll-tags.md                                     (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Operational requirement · Permits (oversize, overweight, hazmat) 
        + Toll tags (TxTAG, EZ-Pass, IPass) per unit · Currently in 
        spreadsheets

PROBLEM: Permits expire. Toll tags get deactivated. Driver discovers at 
toll booth or weigh station. Need centralized tracking + expiry alerts.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0329
  CREATE TABLE IF NOT EXISTS master_data.unit_permits (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    unit_uuid UUID NOT NULL,
    permit_type TEXT CHECK (permit_type IN ('oversize','overweight','hazmat','idle','specialized')) NOT NULL,
    issuing_state TEXT NOT NULL,
    permit_number TEXT NOT NULL,
    effective_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    cost NUMERIC(8,2),
    notes TEXT,
    pdf_evidence_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS master_data.unit_toll_tags (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    unit_uuid UUID NOT NULL,
    tag_network TEXT CHECK (tag_network IN ('txtag','ezpass','ipass','sunpass','fastrak','prepass')) NOT NULL,
    tag_number TEXT NOT NULL,
    activated_at DATE NOT NULL,
    deactivated_at DATE,
    monthly_fee NUMERIC(6,2),
    balance_current NUMERIC(8,2),
    auto_replenish BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_permits_unit_exp ON master_data.unit_permits(unit_uuid, expiration_date);
  CREATE INDEX idx_toll_tags_unit ON master_data.unit_toll_tags(unit_uuid);
  GRANT SELECT, INSERT, UPDATE ON master_data.unit_permits, master_data.unit_toll_tags TO app_user;

PIECE B — Services
  permits/service.ts: CRUD + expiry alerts (extends cert-monitor from GAP-82)
  toll-tags/service.ts: CRUD + balance tracking

PIECE C — Routes
  POST/GET/PATCH/DELETE-soft /api/units/:unit_uuid/permits
  POST/GET/PATCH/DELETE-soft /api/units/:unit_uuid/toll-tags

PIECE D — Frontend
  UnitPermitsTab.tsx: per-unit permits with expiry badges
  UnitTollTagsTab.tsx: per-unit toll tags with balance
  UnitDetail.tsx EDIT: add both tabs.

PIECE E — CI guard
  verify-permits-toll-tags.mjs: migration, routes, tabs render.

PIECE F — Tests
  permits.test.ts + toll-tags.test.ts: CRUD, expiry, soft-delete (no hard), RLS.

PIECE G — Docs
  docs/specs/gap-85-permits-toll-tags.md

ACCEPTANCE:
[ ] Migration 0329 applied
[ ] Both tabs render on UnitDetail
[ ] Soft-delete only (additive-only enforced)
[ ] Expiry alerts wire to GAP-82 monitor
[ ] verify-permits-toll-tags.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if hard-delete attempted, STOP — additive-only rule strict.

POST-MERGE NEXT STEPS: dispatch pre-flight (GAP-14) can warn if load 
       requires permit unit doesn't have.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
