═══════════════════════════════════════════════════════════════
BLOCK A8 — AUDIT-REPORTS-SECTION
Relates to: Universal Audit Linkage, Layer 3 (READ). After A6.
═══════════════════════════════════════════════════════════════

GOAL
A dedicated "Audit" section under Reports (#22, /reports): pre-built audit reports
that read the spine — the formal, exportable view for compliance / review.

TO THE CODER — off current main (A6 merged first):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a8-audit-reports-section

NO migration. Reads events.event_log via the A6 API / dedicated report queries.

REPORTS TO ADD under Reports → Audit:
  - Activity by user (who did what, date range)
  - Activity by module (dispatch / maintenance / accounting / banking)
  - Financial change log (all invoice/bill/payment/journal create/edit/void/post)
  - Maintenance decision log (driver-reported failures: accepted/deferred/approved/worked)
  - Deduction trail (banking driver-tags → settlement application)
  - Void & reversal report (every voided/reversed financial record + who/when/why)
  - Period close history (closed/reopened periods)
  Each: filterable by date/actor/module/entity, paginated, CSV/PDF export, read-only.

NOTE on existing Reports page: if adding the Audit nav entry changes the existing
Reports layout visibly, that part needs a visual preview. New report sub-pages
themselves are new pages (no preview needed). Claude will preview the nav change only.

verify-a8-audit-reports-section.mjs: assert each report query enforces RLS + pagination;
assert read-only (no mutation in report routes).
Push BLOCK_ID=A8-AUDIT-REPORTS-SECTION, ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
