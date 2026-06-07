═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-91 — Mobile-Responsive Audit + PWA Touch UI Polish
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-U  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-92 (Lane B) — same wave P2-U

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-92 owned):
  apps/backend/src/lib/feature-flags/**
  apps/frontend/src/lib/feature-flags-client.ts

ALLOWED FILES (disjoint from Lane B):
  apps/frontend/src/audit/mobile-responsive/auditor.script.mjs               (NEW)
  apps/frontend/src/styles/mobile-responsive-tweaks.css                      (NEW)
  apps/frontend/src/components/shared/MobileOptimizedTable.tsx               (NEW)
  apps/frontend/src/components/shared/SwipeActionRow.tsx                     (NEW)
  apps/driver-pwa/src/styles/touch-target-tweaks.css                         (NEW)
  apps/driver-pwa/src/components/shared/TouchOptimizedButton.tsx             (NEW)
  apps/frontend/src/pages/admin/mobile-audit/MobileAuditReport.tsx           (NEW)
  scripts/verify-mobile-responsive-audit.mjs                                 (NEW CI guard)
  docs/specs/gap-91-mobile-responsive-audit.md                               (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Operators access TMS on phones/tablets · Driver PWA primary mobile 
        target · Touch targets <44px fail Apple/Google guidelines

PROBLEM: Many pages designed desktop-first. Tables overflow viewport on 
mobile. Buttons too small (<44px touch target). Driver PWA borderline 
usable in gloves. CLOSURE-27 mobile-edge improved some, but full audit 
+ polish needed.

SCOPE — ADDITIVE ONLY:

PIECE A — Audit script
  auditor.script.mjs:
    Headless Chrome at 375×667 viewport (iPhone SE 2nd gen)
    Loads every route, captures screenshots
    Checks:
      - Horizontal scroll detected → flag
      - Button <44px in any dimension → flag
      - Touch target spacing <8px → flag
      - Modal exceeds viewport → flag
      - Form input <44px height → flag
    Outputs report JSON.

PIECE B — CSS tweaks
  mobile-responsive-tweaks.css:
    Force button min-height: 44px on mobile breakpoint
    Force input height: 48px
    Table → cards on <640px
    Modal max-height: 90vh with internal scroll

PIECE C — Touch-optimized components
  MobileOptimizedTable.tsx: renders as table on desktop, cards on mobile
  SwipeActionRow.tsx: swipe gestures for common row actions
  TouchOptimizedButton.tsx (driver PWA): 56px min height, 16px gap

PIECE D — Audit report page
  MobileAuditReport.tsx (route /admin/mobile-audit):
    Shows flagged issues from latest audit run
    Per-issue: screenshot, suggested fix, owner module

PIECE E — CI guard
  verify-mobile-responsive-audit.mjs:
    Runs audit script as part of CI
    Fails if NEW issues added (regression detector)
    Acceptable issues whitelisted in initial baseline

PIECE F — Tests
  CSS tests via Vitest jsdom + visual regression in Vitest UI.

PIECE G — Docs
  docs/specs/gap-91-mobile-responsive-audit.md

ACCEPTANCE:
[ ] Audit script runs in CI
[ ] All button touch targets >=44px
[ ] All input heights >=48px on mobile
[ ] No horizontal scroll on any route at 375px
[ ] Driver PWA buttons >=56px (gloves usable)
[ ] verify-mobile-responsive-audit.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if audit baseline has >100 issues (overwhelming), STOP and triage 
       into separate fix blocks per module.

POST-MERGE NEXT STEPS: ongoing CI gate prevents mobile regression on new 
       features.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
