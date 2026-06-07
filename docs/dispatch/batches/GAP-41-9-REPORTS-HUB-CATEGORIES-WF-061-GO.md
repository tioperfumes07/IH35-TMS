═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-41 — 9 Reports Hub Categories with Hover-Dropdown WF-061
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-S  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-40 (Lane A) — same wave G-S

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-40 owned):
  apps/backend/src/documents/**
  apps/backend/src/safety/damage-reports/**
  apps/frontend/src/components/safety/**

ALLOWED FILES (disjoint from Lane A):
  apps/frontend/src/pages/reports/ReportsHub.tsx                             (EDIT — 9 categories)
  apps/frontend/src/components/reports/ReportCategoryHoverNav.tsx            (NEW)
  apps/frontend/src/components/reports/ReportCard.tsx                        (NEW)
  apps/frontend/src/pages/reports/categories/                                 (NEW dir, 9 files)
  apps/backend/src/reports/categories/category-catalog.ts                    (NEW)
  apps/backend/src/reports/categories/routes.ts                              (NEW)
  apps/backend/src/reports/categories/__tests__/                              (NEW dir)
  scripts/verify-reports-hub-9-categories.mjs                                (NEW CI guard)
  docs/specs/gap-41-reports-hub-9-categories.md                              (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: WF-061 9-category Reports Hub spec · Q8 scheduled report categories · 
        Current Reports page is flat list; spec requires 9 organized 
        categories with hover-dropdown nav (per G3 hover pattern)

PROBLEM: Reports page shows 11 reports as flat list. Hard to scan. WF-061 
requires categorization into 9 groups:
  1. Operations Dispatch
  2. Driver Performance  
  3. Equipment & Maintenance
  4. Safety & Compliance
  5. Customers & Revenue
  6. Vendors & Costs
  7. Accounting & Financial Statements
  8. Tax & Regulatory (IFTA, 2290, CSA)
  9. Multi-Company & Consolidated

SCOPE — ADDITIVE ONLY (existing reports stay; categorization is overlay):

PIECE A — Category catalog
  category-catalog.ts:
    export const REPORT_CATEGORIES = [
      { id: 'ops-dispatch',  label: 'Operations & Dispatch',  reports: [...] },
      { id: 'driver-perf',   label: 'Driver Performance',     reports: [...] },
      { id: 'equipment',     label: 'Equipment & Maintenance',reports: [...] },
      { id: 'safety',        label: 'Safety & Compliance',    reports: [...] },
      { id: 'customers',     label: 'Customers & Revenue',    reports: [...] },
      { id: 'vendors',       label: 'Vendors & Costs',        reports: [...] },
      { id: 'accounting',    label: 'Accounting & Financials',reports: [...] },
      { id: 'tax-reg',       label: 'Tax & Regulatory',       reports: [...] },
      { id: 'multi-company', label: 'Multi-Company View',     reports: [...] },
    ];
    Each report entry: {id, label, route, icon, description}

PIECE B — Routes
  GET /api/reports/categories/catalog (returns full structure)

PIECE C — Frontend hover-dropdown nav
  ReportCategoryHoverNav.tsx:
    Top-bar with 9 category buttons
    Hover → dropdown panel with reports in that category
    Click report → navigates to existing report page (additive — no 
    existing routes change)

PIECE D — ReportsHub layout
  ReportsHub.tsx EDIT:
    Header: ReportCategoryHoverNav
    Body: ReportCard grid grouped by category, search field at top
  ReportCard.tsx: clickable card with icon, label, description, "Open →"

PIECE E — Per-category landing pages (optional)
  categories/{slug}.tsx: 9 files, each renders category-filtered card grid.

PIECE F — CI guard
  verify-reports-hub-9-categories.mjs: 
    Catalog has 9 categories
    Hover nav renders 9 buttons
    All existing reports assigned to ≥1 category (no orphans)
    No existing report routes broken

PIECE G — Tests
  Backend: catalog completeness, RLS isolation
  Frontend snapshot test of hover nav rendering 9 categories

PIECE H — Docs
  docs/specs/gap-41-reports-hub-9-categories.md (cite WF-061, list all 
  ~30 reports assigned to categories)

ACCEPTANCE:
[ ] 9 categories defined + populated
[ ] Hover-dropdown nav works
[ ] All existing reports findable via categorization
[ ] No regression on existing report routes
[ ] verify-reports-hub-9-categories.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any existing report becomes inaccessible after refactor, STOP — 
       additive-only rule violated.

POST-MERGE NEXT STEPS: GAP-42, GAP-43, GAP-44, GAP-45 add reports into 
       these categories naturally.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════
