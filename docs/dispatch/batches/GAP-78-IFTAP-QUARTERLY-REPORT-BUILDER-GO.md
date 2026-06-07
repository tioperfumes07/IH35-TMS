═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-78 — IFTAP Quarterly Report Builder
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-N  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-77 (Lane A) — same wave P2-N

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-77 owned):
  apps/backend/src/fuel/route-optimizer/**
  apps/frontend/src/pages/fuel/route-optimizer/RouteOptimizerPanel.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/fuel/iftap-quarterly/builder.service.ts                   (NEW)
  apps/backend/src/fuel/iftap-quarterly/pdf-export.ts                        (NEW)
  apps/backend/src/fuel/iftap-quarterly/routes.ts                            (NEW)
  apps/backend/src/fuel/iftap-quarterly/__tests__/                           (NEW)
  apps/frontend/src/pages/fuel/iftap/IftapQuarterlyReport.tsx                (NEW)
  apps/frontend/src/pages/fuel/iftap/IftapBuilderWizard.tsx                  (NEW)
  scripts/verify-iftap-quarterly.mjs                                         (NEW CI guard)
  docs/specs/gap-78-iftap-quarterly.md                                       (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: GAP-42 IFTA 4-step exists for tax filing · This is the per-quarter 
        report builder that feeds it · Tax compliance reqirement

PROBLEM: IFTA (International Fuel Tax Agreement) quarterly report requires:
  - Miles driven per state per truck
  - Gallons purchased per state
  - Tax owed/refund per state
Currently calculated manually quarterly. Error-prone. Penalties for errors.

SCOPE — ADDITIVE ONLY:

PIECE A — Builder service
  builder.service.ts:
    buildQuarterlyReport(operating_company_id, quarter='2026-Q2') →
      Pulls samsara miles data + fuel purchases per state per truck
      Computes tax owed/refund per state per truck
      Returns structured report

PIECE B — PDF export
  pdf-export.ts: generates IFTA-compliant PDF using existing pdf-lib pattern

PIECE C — Routes
  GET  /api/fuel/iftap/quarterly?quarter=&operating_company_id=
  POST /api/fuel/iftap/quarterly/export-pdf

PIECE D — Frontend
  IftapBuilderWizard.tsx (/fuel/iftap/build):
    Step 1: Quarter selector
    Step 2: Data review (miles + fuel per state per truck)
    Step 3: Discrepancy review (flag missing data)
    Step 4: Export PDF + submit
  IftapQuarterlyReport.tsx (/fuel/iftap/reports):
    History of generated reports

PIECE E — CI guard
  verify-iftap-quarterly.mjs: routes, wizard renders, PDF export works.

PIECE F — Tests
  builder.test.ts: per-state computation accuracy, multi-truck aggregation, 
    edge cases (truck never entered state), RLS.

PIECE G — Docs
  docs/specs/gap-78-iftap-quarterly.md (cite IFTA spec)

ACCEPTANCE:
[ ] Wizard renders + completes
[ ] Per-state computation matches manual calc on test data within $1
[ ] PDF exports IFTA-compliant
[ ] verify-iftap-quarterly.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if samsara mileage data has gaps (truck not always reporting), 
       STOP — manual reconciliation step needed.

POST-MERGE NEXT STEPS: feeds GAP-42 4-step preparer-Owner approval flow.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
