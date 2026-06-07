═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-7 — G20 Severe Repair / OOS Estimate Generation
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-C  ·  LANE: A  ·  CURSOR-A
SEQUENCING: dispatch AFTER GAP-6 ships (depends on duration_minutes column)
PAIRED WITH: GAP-8 (Lane B) — same wave G-C

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-8 owned):
  apps/frontend/src/pages/dispatch/**
  apps/backend/src/dispatch/assignments/**

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/maintenance/severe-repair/severe-estimate.service.ts     (NEW)
  apps/backend/src/maintenance/severe-repair/severe-estimate.routes.ts      (NEW)
  apps/backend/src/maintenance/severe-repair/__tests__/estimate.test.ts     (NEW)
  apps/frontend/src/pages/maintenance/severe-repair/SevereRepairOOS.tsx     (EDIT — auto-estimate)
  apps/frontend/src/pages/home/HomeFleetRestoreCard.tsx                     (NEW)
  apps/frontend/src/pages/home/Home.tsx                                     (EDIT — add card)
  apps/backend/src/maintenance/severe-repair/pdf-export.ts                  (NEW)
  scripts/verify-severe-repair-estimate.mjs                                 (NEW CI guard)
  docs/specs/gap-7-severe-repair-oos-estimate.md                            (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: G20 master rule — "Owner sees total $ needed to restore fleet" ·
        Existing /maintenance/severe-repair-oos page lacks aggregate · 
        Owner needs financial visibility per Jorge directives

PROBLEM: /maintenance/severe-repair-oos page lists WOs flagged severe/OOS but
does NOT show:
  (a) Total $ to restore fleet (sum of estimated_cost + actual_cost)
  (b) Per-unit breakdown
  (c) Owner dashboard surface card on /home
  (d) Insurance-claim-ready PDF export

SCOPE — ADDITIVE ONLY:

PIECE A — Backend service
  severe-estimate.service.ts:
    - getFleetRestoreCost() → {total_estimated, total_actual, total_remaining, unit_count}
    - getPerUnitBreakdown() → array of {unit_uuid, display_id, open_wo_count, total_cost, severity}
    - exportInsurancePdf(filter) → PDF blob

PIECE B — Routes
  GET /api/maintenance/severe-repair/fleet-restore-cost
  GET /api/maintenance/severe-repair/per-unit-breakdown
  POST /api/maintenance/severe-repair/export-pdf (RBAC: Owner only)

PIECE C — Frontend
  SevereRepairOOS.tsx: add aggregate panel at top (Total Estimated, Total 
    Actual, Remaining to Restore, Avg Time Open from GAP-6).
  HomeFleetRestoreCard.tsx: new card (Owner role only) showing 
    "Fleet Restore Cost: $X across N units".
  Home.tsx: add card to Today's Attention List sidebar (Owner-only render).

PIECE D — PDF export
  pdf-export.ts: uses existing pdf-lib pattern from Factoring packets.
  Layout: header with date, summary, per-unit table, photos thumbnails.

PIECE E — CI guard
  verify-severe-repair-estimate.mjs: routes registered, aggregate component 
  renders, Owner-only RBAC enforced, wired into verify:arch-design.

PIECE F — Tests
  estimate.test.ts: aggregate accuracy, per-unit grouping, RBAC, PDF generation.

PIECE G — Docs
  docs/specs/gap-7-severe-repair-oos-estimate.md

ACCEPTANCE:
[ ] All 3 routes return correct data
[ ] Aggregate matches sum(estimated_cost) raw query
[ ] Home card renders for Owner role only (other roles: hidden)
[ ] PDF export works + matches insurance-claim format
[ ] verify-severe-repair-estimate.mjs in CI chain
[ ] No regression

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if Owner role RBAC test fails (other roles see card), STOP — security
       regression cannot ship.

POST-MERGE NEXT STEPS: feeds into 425C Exhibits (GAP-44) for bankruptcy 
filings showing OOS-justified expenses.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
