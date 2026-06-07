═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-82 — Medical Card + CDL Expiry Tracking + Alerts
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-P  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-81 (Lane A) — same wave P2-P

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-81 owned):
  apps/backend/src/safety/drug-alcohol/**
  apps/frontend/src/pages/safety/drug-alcohol/**

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/safety/expiry-tracking/cert-monitor.service.ts            (NEW)
  apps/backend/src/safety/expiry-tracking/alerter.service.ts                 (NEW)
  apps/backend/src/safety/expiry-tracking/routes.ts                          (NEW)
  apps/backend/src/safety/expiry-tracking/__tests__/                         (NEW)
  apps/backend/src/jobs/cert-expiry-monitor.ts                               (NEW)
  apps/frontend/src/pages/safety/expiry-tracking/ExpiryDashboard.tsx         (NEW)
  apps/frontend/src/components/safety/CertExpiryBadge.tsx                    (NEW)
  apps/frontend/src/pages/drivers/DriverDetail.tsx                           (EDIT — add expiry badges)
  apps/frontend/src/components/safety/SafetyGroupNav.tsx                     (EDIT — add tab)
  scripts/verify-cert-expiry-tracking.mjs                                    (NEW CI guard)
  docs/specs/gap-82-cert-expiry-tracking.md                                  (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: FMCSA + State CDL requirements · Driver Files & Training Group 1 
        expansion · Existing data exists but not monitored proactively

PROBLEM: Driver certs (CDL, medical card, hazmat endorsement, TWIC, 
passport) have expiry dates. Without proactive 30/60/90 day alerts, 
expired certs result in dispatch blocking + DOT violations.

SCOPE — ADDITIVE ONLY:

PIECE A — Monitor service
  cert-monitor.service.ts:
    scanAllDrivers() →
      For each active driver:
        Check: cdl_expiry, medical_card_expiry, hazmat_endorsement_expiry, 
               twic_expiry, passport_expiry, drug_test_due_date
        Compute days_until_expiry per cert
        Severity: critical (<14d), warn (15-30d), info (31-60d)
      Returns alerts.

PIECE B — Alerter
  alerter.service.ts:
    On critical: notify driver + Safety Officer + Driver Manager 
      via existing Twilio/email pattern
    On warn/info: surface in dashboard only

PIECE C — Worker
  cert-expiry-monitor.ts: runs daily at 06:00 CT.

PIECE D — Routes
  GET /api/safety/cert-expiry/all?severity=
  GET /api/safety/cert-expiry/driver/:uuid

PIECE E — Frontend
  ExpiryDashboard.tsx (new Safety tab — Group 1):
    Sortable list of all expiring certs across fleet
    Filter by cert type, by severity
  CertExpiryBadge.tsx: small badge on DriverDetail for each cert
  DriverDetail.tsx EDIT: add badges to header
  SafetyGroupNav.tsx EDIT: add tab (Safety: 24 → 25 tabs)

PIECE F — CI guard
  verify-cert-expiry-tracking.mjs: worker, routes, dashboard + badges render.

PIECE G — Tests
  cert-monitor.test.ts: severity calc, edge cases (today's expiry), RLS.

PIECE H — Docs
  docs/specs/gap-82-cert-expiry-tracking.md

ACCEPTANCE:
[ ] Worker runs daily
[ ] All 6 cert types tracked
[ ] Critical notifications fire
[ ] Dashboard renders sorted list
[ ] Badges on DriverDetail
[ ] verify-cert-expiry-tracking.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if test fires false positive due to NULL expiry dates, STOP — 
       data quality check first.

POST-MERGE NEXT STEPS: feeds Safety Officer home (GAP-68) and dispatch 
       pre-flight validation (GAP-14).

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
