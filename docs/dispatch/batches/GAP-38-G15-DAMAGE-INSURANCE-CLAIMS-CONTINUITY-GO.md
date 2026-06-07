═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-38 — G15 Damage Reports + Insurance Claims Continuity (WF-027)
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-R  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-39 (Lane B) — same wave G-R

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-39 owned):
  apps/backend/src/integrations/samsara/geofences/state-machine/**
  apps/backend/src/dispatch/geofences/**

ALLOWED FILES (disjoint from Lane B):
  migrations/0315_damage_insurance_continuity.sql                            (NEW)
  apps/backend/src/safety/damage-reports/continuity.service.ts               (NEW)
  apps/backend/src/safety/damage-reports/insurance-link.service.ts           (NEW)
  apps/backend/src/safety/damage-reports/routes.ts                           (EDIT)
  apps/backend/src/safety/damage-reports/__tests__/continuity.test.ts        (NEW)
  apps/backend/src/jobs/damage-continuity-worker.ts                          (NEW)
  apps/frontend/src/pages/safety/damage-reports/DamageReportDetail.tsx       (EDIT — add continuity panel)
  apps/frontend/src/components/safety/DamageContinuityChain.tsx              (NEW)
  apps/frontend/src/components/safety/InsuranceClaimLinkBadge.tsx            (NEW)
  scripts/verify-damage-insurance-continuity.mjs                             (NEW CI guard)
  docs/specs/gap-38-damage-insurance-continuity.md                           (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G15 master rule + WF-027 · Damage tracking needs continuity from 
        first report through final claim resolution · Insurance claims 
        must link back to original damage events

PROBLEM: Today damage_reports and insurance_claims live in separate tables 
with no enforced linkage. When auditing:
  - Can't trace a $5000 insurance payout back to the original damage event
  - Can't see "damage detected at transfer → claim filed → claim approved → 
    settled" chain
  - WF-027 spec says damage incidents auto-create claim drafts; this is 
    not enforced today

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0315
  ALTER TABLE safety.damage_reports
    ADD COLUMN IF NOT EXISTS continuity_chain_uuid UUID,
    ADD COLUMN IF NOT EXISTS parent_damage_uuid UUID REFERENCES safety.damage_reports(uuid),
    ADD COLUMN IF NOT EXISTS auto_created_claim_uuid UUID,
    ADD COLUMN IF NOT EXISTS final_resolution_status TEXT CHECK (final_resolution_status IN ('open','claim_filed','claim_approved','claim_denied','self_paid','closed_no_action'));
  CREATE TABLE IF NOT EXISTS safety.damage_continuity_chains (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    initial_damage_uuid UUID NOT NULL REFERENCES safety.damage_reports(uuid),
    insurance_claim_uuid UUID,
    total_estimated_cost NUMERIC(12,2),
    total_actual_cost NUMERIC(12,2),
    chain_started_at TIMESTAMPTZ NOT NULL,
    chain_closed_at TIMESTAMPTZ,
    audit_summary JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_chain_initial ON safety.damage_continuity_chains(initial_damage_uuid);
  GRANT SELECT, INSERT, UPDATE ON safety.damage_continuity_chains TO app_user;
  GRANT SELECT, UPDATE ON safety.damage_reports TO app_user;

PIECE B — Continuity service
  continuity.service.ts:
    startChain(initial_damage_uuid) → chain_uuid
    appendDamage(chain_uuid, related_damage_uuid) → audit chain expansion
    closeChain(chain_uuid, final_resolution_status) → audit closure
    getChain(chain_uuid) → full chain with all linked damages + claims

PIECE C — Insurance link service
  insurance-link.service.ts:
    autoCreateClaimFromDamage(damage_uuid) →
      Per WF-027: if estimated_cost > $1000 threshold, auto-create 
      safety.insurance_claims draft, set damage_reports.auto_created_claim_uuid
    linkClaimToChain(claim_uuid, chain_uuid) → audit linkage

PIECE D — Worker
  damage-continuity-worker.ts:
    Runs every 1h.
    For new damage_reports: assess if auto-create claim per WF-027.
    For damages without continuity_chain_uuid: create new chain.

PIECE E — Routes
  POST  /api/safety/damage-reports/:uuid/start-continuity
  PATCH /api/safety/damage-reports/:uuid/link-to-chain
  GET   /api/safety/damage-reports/:uuid/continuity-chain
  POST  /api/safety/damage-reports/:uuid/auto-create-claim (manual trigger)

PIECE F — Frontend
  DamageReportDetail.tsx EDIT: add Continuity panel showing chain + 
    linked claim + total estimated/actual cost + resolution status badge.
  DamageContinuityChain.tsx: visual chain (vertical timeline) of all 
    related damages + their resolution.
  InsuranceClaimLinkBadge.tsx: small badge showing claim # + status if linked.

PIECE G — CI guard
  verify-damage-insurance-continuity.mjs: migration applied, worker registered, 
    routes registered, UI panels rendered.

PIECE H — Tests
  continuity.test.ts: chain creation, append, close, auto-claim creation per 
    threshold, RLS isolation.

PIECE I — Docs
  docs/specs/gap-38-damage-insurance-continuity.md (cite G15, WF-027)

ACCEPTANCE:
[ ] Migration 0315 applied
[ ] Worker auto-creates claims for damage > threshold
[ ] DamageReportDetail shows continuity chain
[ ] Chain timeline renders correctly
[ ] verify-damage-insurance-continuity.mjs in CI chain
[ ] No regression on existing damage reports flow

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if auto-claim threshold creates too many false-positive drafts 
       (>5% noise), STOP — threshold needs tuning before deploy.

POST-MERGE NEXT STEPS: integrates with Insurance module (existing) and 
       GAP-40 (photo EXIF chain) for evidence integrity.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
