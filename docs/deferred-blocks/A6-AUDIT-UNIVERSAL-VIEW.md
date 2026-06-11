═══════════════════════════════════════════════════════════════
BLOCK A6 — AUDIT-UNIVERSAL-VIEW
Relates to: Universal Audit Linkage, Layer 3 (READ). After A2–A5 (needs emitted data).
═══════════════════════════════════════════════════════════════

GOAL
A single universal Audit Trail page that reads the spine back: every event across
every module, filterable, each row click-through to its source record. NEW PAGE
(no preview gate required for a brand-new page, but follow locked design tokens).

TO THE CODER — off current main:
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a6-audit-universal-view

READ API (no migration; read-only over events.event_log):
  GET /audit/events  with filters:
    ?module= (dispatch|maintenance|accounting|banking|safety|...)
    ?entity_type= &entity_id=
    ?actor_user_id=
    ?action=
    ?from= &to=  (date range)
    ?correlation_id=  (group a multi-step action)
    pagination (cursor or page/limit) — REQUIRED, never return unbounded.
  RLS on the read: NULLIF(current_setting('app.operating_company_id',true),'')::uuid
  Returns: occurred_at, actor (resolved to user name), action, entity_type,
    entity_id, source_table, source_reference_id, before/after summary.

PAGE — new sidebar-reachable Audit Trail page (design tokens: topbar #0f1219,
  cards border-gray-200 bg-white p-3 @4px, green #16A34A):
    - filter bar (module, actor, entity, action, date range)
    - a register-style table: time · actor · action · entity · source (link) · diff
    - each row's "source" links to the originating record (banking txn, WO, load,
      invoice, bill) — click-through via source_table + source_reference_id
    - a "view changes" expander showing before→after
    - export current view (CSV) — read-only
  READ-ONLY. No mutation. No financial writes. The page only reads the spine.

verify-a6-audit-universal-view.mjs: assert the read endpoint enforces pagination +
RLS; assert no write/mutation in the audit routes.
Push BLOCK_ID=A6-AUDIT-UNIVERSAL-VIEW, ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
