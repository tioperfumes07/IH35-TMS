═══════════════════════════════════════════════════════════════
BLOCK B2 — RETURN-ARROW-ALL-PAGES
Phase B. EXISTING PAGES → visual preview approved BEFORE code dispatch.
═══════════════════════════════════════════════════════════════

GOAL
Every page has a consistent back / return arrow in the same position, behaving the
same way (returns to the prior page / parent view), matching QBO navigation feel.

SCOPE
  - Add a standard back-arrow component to the top-left of every detail/sub page.
  - Consistent icon, position, and behavior across all 26 sidebar sections + sub-pages.
  - Does NOT change page content — navigation chrome only.

PROCESS
  - EXISTING pages → Claude renders a visual preview of the arrow placement on a
    representative set of pages for Jorge's approval BEFORE dispatch.
  - No migration. Shared component, applied app-wide.

verify-return-arrow.mjs: assert the shared back-arrow component is mounted on the
page templates / layouts it should cover.
After preview approval → build, push BLOCK_ID=B2-RETURN-ARROW-ALL-PAGES, ls-remote, PR.
Report PR# + SHA.
