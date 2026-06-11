═══════════════════════════════════════════════════════════════
BLOCK OB6 — DEAD-STUB-TAB-RESOLUTION  (Payroll redirect + Tasks stub)
Option B. Mostly routing/labeling; Settlements build itself is D1 (separate).
═══════════════════════════════════════════════════════════════

DEFECT (reproduced live)
  - PAYROLL (#26, /payroll-integration): navigating to it REDIRECTS to /home and shows
    the Workspace snapshot. It is a dead tab — no payroll page renders.
  - TASKS (#2, /tasks): shows a placeholder "Module · In active development" with a
    roadmap note. It is a stub, not a built page.

GOAL
  Make these two tabs honest and non-confusing until their real builds land.

TO THE CODER
  git checkout main && git pull origin main && npm install
  git checkout -b feat/ob6-dead-stub-resolution
  1. PAYROLL (#26): per the locked decision it will be REPLACED by Settlements (built
     in D1) and repositioned between Cash Flow (#12) and Accounting (#13). Until D1
     ships, do NOT leave it silently redirecting to /home. Options (pick with Jorge in
     preview): (a) hide the Payroll sidebar item until Settlements ships, OR
     (b) render an honest placeholder "Settlements — coming soon" at the new position.
     Do NOT leave a tab that pretends to be Payroll but bounces to Home.
  2. TASKS (#2): keep the "in active development" placeholder but make it explicit and
     non-misleading (clear "not yet available" state). No fake functionality.
  3. Confirm neither tab is a silent dead-end (ties into OB2 dead-click audit).
  NO migration. Routing/labeling + sidebar config only.
  PREVIEW the sidebar change (hide vs placeholder) for Jorge before dispatch.
  verify-ob6-dead-stub.mjs: assert /payroll-integration no longer silently redirects
  to /home; assert Tasks shows an explicit not-available state.
  Push BLOCK_ID=OB6-DEAD-STUB-RESOLUTION, ls-remote, PR. Report PR# + SHA.
