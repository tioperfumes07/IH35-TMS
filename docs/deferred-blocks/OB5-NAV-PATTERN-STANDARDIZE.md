═══════════════════════════════════════════════════════════════
BLOCK OB5 — NAV-PATTERN-STANDARDIZE  (one nav pattern app-wide)
Option B. EXISTING PAGES → visual preview approved BEFORE dispatch.
═══════════════════════════════════════════════════════════════

DEFECT (reproduced live)
  Inconsistent navigation chrome across the 26 modules:
   - SAFETY (#7) and INSURANCE (#9) use a breadcrumb header
     ("← Back > Modules > Safety > ...") instead of the standard arrow + tab row.
   - LISTS (#21) and REPORTS (#22) render their top-tab row ABOVE the page title;
     every other module renders tabs BELOW the title.
   - 425C (#20) dark banner header has NO visible return arrow.
  Jorge wants consistency: every page same sequence, same return-arrow behavior.

GOAL
  ONE nav pattern for all modules:
   - top-left return arrow (←) on every non-home page, returning to the correct parent
   - page title + subtitle
   - tab row BELOW the title (standardize Lists + Reports to match)
   - retire the breadcrumb variant on Safety + Insurance → convert to arrow+tabs
   - add the return arrow to 425C's banner header

TO THE CODER
  git checkout main && git pull origin main && npm install
  git checkout -b feat/ob5-nav-pattern-standardize
  - Identify the shared page-header/layout component. Make Safety + Insurance use it
    (drop breadcrumb). Move Lists + Reports tab rows below the title. Add the arrow to
    425C. Confirm EVERY page (except Home) has a working return arrow that goes to the
    right parent (this also satisfies B2-RETURN-ARROW — coordinate so they don't
    conflict; if B2 already shipped, OB5 just fixes the breadcrumb + tab-position outliers).
  - NO migration. Layout/header only.
  PREVIEW the standardized header on Safety, Insurance, Lists, Reports, 425C for
  Jorge's approval BEFORE dispatch.
  verify-ob5-nav-pattern.mjs: assert no breadcrumb header remains; assert tab rows
  render below title; assert every non-home route mounts the return arrow.
  Push BLOCK_ID=OB5-NAV-PATTERN-STANDARDIZE, ls-remote, PR. Report PR# + SHA.
