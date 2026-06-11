═══════════════════════════════════════════════════════════════
BLOCK A7 — AUDIT-PER-ENTITY-TABS
Relates to: Universal Audit Linkage, Layer 3 (READ). After A6.
EXISTING PAGES → each new "Audit" tab needs a visual preview approved before dispatch.
═══════════════════════════════════════════════════════════════

GOAL
An "Audit" / "History" tab on each major entity detail view, showing that entity's
linked event history read from the spine. Makes every record self-auditing.

TO THE CODER — off current main (A6 merged first; reuses the /audit/events API):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a7-audit-per-entity-tabs

NO migration. Reuses A6 read API filtered by entity_type + entity_id.

ADD AN "AUDIT" TAB TO:
  - Vehicle detail (entity_type='unit')            → maintenance + dispatch + banking events for that unit
  - Load detail (entity_type='load')               → full dispatch lifecycle
  - Driver profile (entity_type='driver')          → assignments, acks, failures, deductions
  - Invoice detail (entity_type='invoice')         → create/edit/send/pay/void
  - Bill detail (entity_type='bill')               → create/pay/void
  - Banking txn detail (entity_type='banking_txn') → categorize/tag/reconcile
  Each tab: chronological list, time · actor · action · source link · before→after.
  Read-only. Reuses A6 API. Design tokens locked.

PREVIEW GATE: these are changes to EXISTING pages → Claude renders a visual preview
of the Audit tab for Jorge's approval BEFORE the UI is dispatched. Back-end nothing
to change (API already exists from A6). So this block is UI-only + preview-gated.

verify-a7-audit-per-entity-tabs.mjs: assert each entity detail view mounts the audit
tab reading the A6 endpoint with the correct entity filter; assert read-only.
Push BLOCK_ID=A7-AUDIT-PER-ENTITY-TABS, ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
