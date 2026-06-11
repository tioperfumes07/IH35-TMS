═══════════════════════════════════════════════════════════════
BLOCK OB4 — NESTED-INPUT-SWEEP  (input-within-input boxes)
Option B. EXISTING PAGES → visual preview if layout changes.
═══════════════════════════════════════════════════════════════

DEFECT (Jorge reported)
  "Many functions in which the type text box is duplicated, one within one." i.e. a
  text input rendered INSIDE another input-like container (double border / box-in-box),
  or two stacked inputs bound to the same field. Confuses where to type and can split
  the value across two controls.

GOAL
  Find and fix every nested/duplicated input box so each field is ONE input.

TO THE CODER
  git checkout main && git pull origin main && npm install
  git checkout -b feat/ob4-nested-input-sweep
  1. Write scripts/audit-nested-inputs.mjs: walk the rendered DOM of every form/drawer
     (create invoice, bill, expense, journal entry, customer, vendor, driver profile,
     item profile, settlement, work order, load, etc.) and flag any container that
     holds MORE THAN ONE <input>/<textarea>/[contenteditable] bound to the same logical
     field, OR an input wrapper whose direct child is itself an input wrapper
     (box-in-box). Output: page, field, wrapper class, input count.
  2. For each finding, collapse to a single input: remove the redundant inner/outer
     input, keep the correct binding + styling, ensure the label still associates.
  3. Re-run the audit → zero nested-input findings.
  Inspect at minimum these high-traffic forms (Jorge types in these most):
    - Accounting: create invoice / bill / expense / journal entry, customer & vendor edit
    - Dispatch: book load, assignment
    - Maintenance: create work order
    - Driver Profile: edit driver, item/unit profiles
    - Settlements (when D1 exists)
  guard: scripts/verify-ob4-nested-inputs.mjs — FAILS if the audit finds any
    input-within-input or duplicate-bound input.
  NO migration. PREVIEW any form whose layout visibly changes.
  Push BLOCK_ID=OB4-NESTED-INPUT-SWEEP, ls-remote, PR. Report PR# + SHA + the audit list.
