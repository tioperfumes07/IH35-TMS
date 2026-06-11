═══════════════════════════════════════════════════════════════
BLOCK OB2 — DEAD-TAB-AUDIT-AND-FIX  (every click goes somewhere)
Option B. EXISTING PAGES → visual preview only if layout changes; behavior fixes OK.
═══════════════════════════════════════════════════════════════

DEFECT (reproduced live)
  The Accounting top-nav "Factoring" tab is a <button> whose onClick does nothing:
  clicking it leaves the URL at /accounting and the content on Home. The sibling
  "Bills" tab works correctly. So at least one top-nav tab is wired to a dead handler.
  Pattern: some tabs are <a href> (work), some are <button> with missing/broken
  handlers (dead). Jorge's instruction: "make sure each click takes you somewhere."

GOAL
  Audit EVERY tab, nav item, and actionable control across all 26 modules; ensure each
  one either navigates (href/router push) or switches visible content. NO dead clicks.

TO THE CODER
  git checkout main && git pull origin main && npm install
  git checkout -b feat/ob2-dead-tab-audit
  1. Write scripts/audit-dead-controls.mjs (Node + a headless DOM pass or a route walk):
     for each tab/nav control, assert it has either a valid href/route OR an onClick
     that changes state/route. Flag any <button> tab with no effective handler.
  2. Known dead control to FIX FIRST: the Accounting header "Factoring" tab — wire it
     to navigate to /accounting/factoring (same destination as the sidebar FACT link),
     OR remove it if OB1 already relocates it. (Coordinate with OB1 so they don't fight.)
  3. Fix every other dead tab the audit finds the same way: point it at its real route
     or its content-switch handler.
  guard: scripts/verify-ob2-dead-controls.mjs — runs the audit; FAILS if any tab/nav
    control resolves to no navigation and no content change.
  NO migration. Routing/handler fixes only. Preview only if a tab is relocated/removed.
  Push BLOCK_ID=OB2-DEAD-TAB-AUDIT, ls-remote, PR. Report PR# + SHA + the audit's
  list of dead controls found.
