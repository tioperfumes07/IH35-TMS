═══════════════════════════════════════════════════════════════
BLOCK B1 — UI-DEFECTS-BATCH  (8 visual bugs, QBO-style cleanup)
Phase B. EXISTING PAGES → visual preview approved BEFORE code dispatch.
═══════════════════════════════════════════════════════════════

GOAL
Fix the 8 known visual defects so the UI reads clean and QBO-consistent. These are
display/formatting bugs, not logic — but they touch existing locked pages, so each
visual change needs a preview approved first.

THE 8 DEFECTS
  1. Currency format: values render as "4800" instead of "48.00" (cents vs dollars).
     → format all currency through one money formatter (Intl.NumberFormat, 2 decimals,
       thousands separators). Audit every place a $ value is shown.
  2. Box / card sizing inconsistencies (cards different heights/padding on same row).
     → standardize to locked card token: border-gray-200 bg-white p-3 @4px radius.
  3. Dropdowns not auto-closing (stay open after select / on outside-click).
     → close on select + on outside-click + on Esc.
  4. Blank driver names (name column empty where a driver exists).
     → resolve driver display name; show fallback only when truly unassigned.
  5. Load reserved without a unit (a load can be reserved with no truck assigned).
     → block reserve when no unit, or clearly flag "reserved · no unit" state.
  6-8. The remaining 3 visual bugs in the batch (confirm exact list with Jorge before
     dispatch — capture current screens, list each, get sign-off).

PROCESS (locked):
  - This is UI-only on EXISTING pages → Claude FIRST renders a visual preview/mockup
    of each fix for Jorge's approval. No code dispatched until preview signed off.
  - No migration. No logic change beyond what a display fix requires.
  - If a "fix" turns out to need a data change (e.g. driver name truly missing in
    data), that becomes its own small backend item — do NOT paper over it in the UI.

verify-ui-defects-batch.mjs: lint-style checks where automatable (e.g. assert no raw
cent integers printed without the money formatter in changed files).
After preview approval → build, push BLOCK_ID=B1-UI-DEFECTS-BATCH, ls-remote, PR.
Report PR# + SHA.
