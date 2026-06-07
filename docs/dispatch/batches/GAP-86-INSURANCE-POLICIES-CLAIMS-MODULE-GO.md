═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-86 — Insurance Policies + Claims Module
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-R  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-85 (Lane A) — same wave P2-R

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-85 owned):
  apps/backend/src/master-data/units/permits/**
  apps/backend/src/master-data/units/toll-tags/**

ALLOWED FILES (disjoint from Lane A):
  migrations/0330_insurance_policies_claims.sql                              (NEW)
  apps/backend/src/insurance/policies/service.ts                             (NEW)
  apps/backend/src/insurance/policies/routes.ts                              (NEW)
  apps/backend/src/insurance/claims/service.ts                               (NEW)
  apps/backend/src/insurance/claims/routes.ts                                (NEW)
  apps/backend/src/insurance/__tests__/                                      (NEW)
  apps/frontend/src/pages/insurance/InsuranceHome.tsx                        (NEW)
  apps/frontend/src/pages/insurance/PoliciesList.tsx                         (NEW)
  apps/frontend/src/pages/insurance/ClaimsList.tsx                           (NEW)
  apps/frontend/src/pages/insurance/PolicyDetail.tsx                         (NEW)
  apps/frontend/src/pages/insurance/ClaimDetail.tsx                          (NEW)
  scripts/verify-insurance-module.mjs                                        (NEW CI guard)
  docs/specs/gap-86-insurance-module.md                                      (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Commercial auto + cargo + general liability + workers comp · 
        Premium budget visibility · Claims tracking + recovery

PROBLEM: Insurance information scattered: policies in folders, claims 
in emails. No central view of policy coverage, premium tracking, claim 
recovery status.

SCOPE — ADDITIVE ONLY:

PIECE A — Migration 0330
  CREATE TABLE IF NOT EXISTS insurance.policies (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    carrier_name TEXT NOT NULL,
    policy_type TEXT CHECK (policy_type IN ('commercial_auto','cargo','general_liability','workers_comp','umbrella','garage','occupational_accident','specialty')) NOT NULL,
    policy_number TEXT NOT NULL,
    effective_date DATE NOT NULL,
    expiration_date DATE NOT NULL,
    annual_premium NUMERIC(12,2),
    coverage_limit NUMERIC(12,2),
    deductible NUMERIC(10,2),
    payment_frequency TEXT CHECK (payment_frequency IN ('annual','semi_annual','quarterly','monthly')),
    pdf_evidence_uuid UUID,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS insurance.claims (
    uuid UUID PRIMARY KEY DEFAULT gen_random_uuid_v7(),
    operating_company_id TEXT NOT NULL,
    policy_uuid UUID NOT NULL REFERENCES insurance.policies(uuid),
    claim_number TEXT,
    claim_type TEXT CHECK (claim_type IN ('accident','cargo_damage','property_damage','liability','workers_comp','other')) NOT NULL,
    incident_date DATE NOT NULL,
    reported_date DATE NOT NULL,
    description TEXT,
    amount_claimed NUMERIC(12,2),
    amount_paid NUMERIC(12,2),
    deductible_paid NUMERIC(10,2),
    status TEXT CHECK (status IN ('open','investigating','approved','denied','closed','litigation','recovered')) NOT NULL,
    adjuster_name TEXT,
    adjuster_email TEXT,
    related_accident_uuid UUID,
    related_load_uuid UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_policy_expiry ON insurance.policies(expiration_date) WHERE is_active = true;
  CREATE INDEX idx_claim_status ON insurance.claims(status);
  GRANT SELECT, INSERT, UPDATE ON insurance.policies, insurance.claims TO app_user;

PIECE B — Services
  policies/service.ts: CRUD + expiry monitoring (extends GAP-82)
  claims/service.ts: CRUD + status updates + recovery tracking

PIECE C — Routes
  POST/GET/PATCH /api/insurance/policies
  POST/GET/PATCH /api/insurance/claims

PIECE D — Frontend
  InsuranceHome.tsx (route /insurance): 
    KPI cards (active policies, total premium annual, open claims count)
  PoliciesList.tsx + PolicyDetail.tsx: policy CRUD
  ClaimsList.tsx + ClaimDetail.tsx: claim CRUD + status timeline

PIECE E — CI guard
  verify-insurance-module.mjs: migration, routes, pages render.

PIECE F — Tests
  policies.test.ts + claims.test.ts: CRUD, expiry, RLS.

PIECE G — Docs
  docs/specs/gap-86-insurance-module.md

ACCEPTANCE:
[ ] Migration 0330 applied
[ ] Insurance module renders 4 pages
[ ] Policies + claims CRUD works
[ ] Expiry monitoring wired to GAP-82
[ ] verify-insurance-module.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if policy upload PDF fails (depends on GAP-11), STOP and verify.

POST-MERGE NEXT STEPS: Owner home (GAP-65) shows expiring policies; 
       accidents (GAP-9) auto-link to claims.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
