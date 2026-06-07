═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-79 — Workers Comp Claim Filing Flow
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-O  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-80 (Lane B) — same wave P2-O

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-80 owned):
  apps/backend/src/safety/csa-basic-scores/**
  apps/frontend/src/pages/safety/csa-basic-scores/CsaBasicScoresTab.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/safety/workers-comp/claim-filing/service.ts               (NEW)
  apps/backend/src/safety/workers-comp/claim-filing/routes.ts                (NEW)
  apps/backend/src/safety/workers-comp/__tests__/claim-filing.test.ts        (NEW)
  apps/frontend/src/pages/safety/workers-comp/ClaimFilingWizard.tsx          (NEW)
  apps/frontend/src/pages/safety/workers-comp/ClaimDetail.tsx                (NEW)
  apps/frontend/src/pages/safety/workers-comp/WorkersCompTab.tsx             (EDIT — add Create button)
  scripts/verify-wc-claim-filing.mjs                                         (NEW CI guard)
  docs/specs/gap-79-wc-claim-filing.md                                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Extension of GAP-9 (Workers Comp tab) · Filing workflow needed · 
        Compliance + insurance coordination

PROBLEM: GAP-9 created table + tab; this block adds the actual filing 
workflow: form fields, witness statements, medical info, carrier-submission 
PDF export, status tracking.

SCOPE — ADDITIVE ONLY (extends GAP-9):

PIECE A — Filing service
  service.ts:
    createClaim({driver_uuid, incident_date, description, witnesses, 
                 medical_provider, body_parts_injured, lost_time_estimate}) → claim_uuid
    updateClaimStatus(uuid, new_status, notes)
    exportClaimPdf(uuid) → carrier-submission PDF

PIECE B — Routes
  POST   /api/safety/workers-comp/claims
  PATCH  /api/safety/workers-comp/claims/:uuid/status
  GET    /api/safety/workers-comp/claims/:uuid/export-pdf

PIECE C — Frontend
  ClaimFilingWizard.tsx (5-step wizard):
    Step 1: Incident basics (date, time, location, witness count)
    Step 2: Driver + injury details (body parts, severity)
    Step 3: Witnesses (add multiple with statements)
    Step 4: Medical (provider, treatment, expected lost time)
    Step 5: Review + submit + auto-PDF export
  ClaimDetail.tsx: view + status updates + document attachments
  WorkersCompTab.tsx EDIT: add "+ File New Claim" button + claim list

PIECE D — CI guard
  verify-wc-claim-filing.mjs: routes, wizard, PDF export render.

PIECE E — Tests
  claim-filing.test.ts: full lifecycle, PDF generation, RLS, status 
    transitions, audit trail.

PIECE F — Docs
  docs/specs/gap-79-wc-claim-filing.md

ACCEPTANCE:
[ ] Wizard completes 5 steps
[ ] Claim created with all details
[ ] PDF export carrier-compliant
[ ] Status transitions audited
[ ] verify-wc-claim-filing.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if carrier-specific PDF format unknown, STOP and confirm with 
       Jorge's WC carrier (likely format varies).

POST-MERGE NEXT STEPS: feeds Safety Officer home (GAP-68) open claims count.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
