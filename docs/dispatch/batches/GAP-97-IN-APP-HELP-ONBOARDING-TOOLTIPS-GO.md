═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-97 — In-App Help System + Onboarding Tooltips
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-X  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: solo (final GAP block, Lane B catch-up)

LANE LOCK — FORBIDDEN PATHS: (none — solo wave)

ALLOWED FILES:
  apps/backend/src/help/articles.service.ts                                  (NEW)
  apps/backend/src/help/routes.ts                                            (NEW)
  apps/backend/src/help/__tests__/                                           (NEW)
  apps/frontend/src/components/help/HelpDrawer.tsx                           (NEW)
  apps/frontend/src/components/help/ContextualHelpTooltip.tsx                (NEW)
  apps/frontend/src/components/help/HelpButton.tsx                           (NEW)
  apps/frontend/src/pages/help/HelpHome.tsx                                  (EDIT — search + categories)
  apps/frontend/src/hooks/useContextualHelp.ts                               (NEW)
  apps/frontend/src/layouts/AppLayout.tsx                                    (EDIT — add help button to topbar)
  docs/specs/gap-97-in-app-help-system.md                                    (NEW)
  scripts/verify-in-app-help.mjs                                             (NEW CI guard)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: CLOSURE-25 runbooks already shipped to /help · This block adds 
        IN-CONTEXT help — tooltips on complex fields + help drawer 
        accessible from anywhere

PROBLEM: /help index exists from CLOSURE-25 with workflow runbooks, but
operators rarely navigate there. Need in-context help: hover-explanation 
tooltips on confusing fields + slide-in help drawer that knows current 
context.

SCOPE — ADDITIVE ONLY:

PIECE A — Articles service
  articles.service.ts:
    searchArticles(query, current_route?) → 
      Indexes existing /help markdown content
      Returns relevance-ranked articles
      Prioritizes articles tagged with current_route

PIECE B — Routes
  GET /api/help/articles?q=&route=
  GET /api/help/contextual?route=  (returns articles tagged for this route)

PIECE C — Frontend components
  HelpDrawer.tsx: slide-in drawer from right edge
    Top: search input
    Body: contextual articles for current route + search results
    "Open in /help" link for full view
  ContextualHelpTooltip.tsx: small "?" icon next to complex fields
    On hover/tap: shows 1-2 sentence help + "Read more" link
  HelpButton.tsx: persistent help button in topbar (opens drawer)

PIECE D — Hook
  useContextualHelp.ts: fetches contextual articles for current route, 
    cached.

PIECE E — Wire into layout
  AppLayout.tsx EDIT: add HelpButton to topbar (right side)

PIECE F — CI guard
  verify-in-app-help.mjs: routes registered, HelpButton in layout, 
    components render.

PIECE G — Tests
  articles.test.ts: search relevance, route-tag priority, RLS.

PIECE H — Docs
  docs/specs/gap-97-in-app-help-system.md

ACCEPTANCE:
[ ] HelpButton in topbar on every page
[ ] Drawer opens with contextual articles
[ ] ContextualHelpTooltip available for use on any field
[ ] Search works across all /help content
[ ] verify-in-app-help.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if search returns irrelevant results (poor indexing), STOP — 
       tune indexing weights.

POST-MERGE NEXT STEPS: ongoing content additions to /help auto-surface 
       in contextual help; future blocks add ContextualHelpTooltip to 
       complex fields.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
