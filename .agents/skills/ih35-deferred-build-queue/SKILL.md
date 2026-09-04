---
name: ih35-deferred-build-queue
description: Historical post-W5 deferred build queue (auto-generated memory). SUPERSEDED by claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md; load for historical context only.
---

# ih35-deferred-build-queue

**Source:** auto-generated Cascade memory `287b022b-91a5-498e-b887-8c117331b307`.

Full deferred build queue in execution order. Specs in `docs/deferred-blocks/` in repo. Build one at a time, merge+deploy-green before next. NEW RULE: build next block only AFTER previous merges to main — no stacking.

## Phase A — Audit Linkage (A0–A9)

- **A0:** AUDIT-LINKAGE-ARCHITECTURE — architecture doc (no code)
- **A1:** AUDIT-SPINE-LINK-COLUMNS — additive columns on event_log (`source_table`, `source_reference_id`, `actor_user_id`, `correlation_id`). PR #884 in review.
- **A2:** AUDIT-EMIT-COVERAGE-DISPATCH — dispatch mutations emit to spine. PR #885 pending A1 merge.
- **A3:** AUDIT-EMIT-COVERAGE-MAINTENANCE — Maintenance WO lifecycle. Needs preview (UI).
- **A4:** AUDIT-EMIT-COVERAGE-ACCOUNTING — every txn logged. Pending A1 merge.
- **A5:** AUDIT-EMIT-COVERAGE-BANKING — txns, driver expenses, transfers.
- **A6:** AUDIT-UNIVERSAL-VIEW — read API + Audit Trail page.
- **A7:** AUDIT-PER-ENTITY-TABS — Audit tab on vehicle/load/invoice/bill/driver (preview-gated).
- **A8:** AUDIT-REPORTS-SECTION — Reports → Audit, filterable/exportable.
- **A9:** AUDIT-CI-EMIT-GUARD — CI gate locks audit coverage.

## Phase B — UI Cleanup (preview-gated, each needs Jorge visual approval before dispatch)

- **B1:** UI-DEFECTS-BATCH — currency 4800→48.00, card sizing, blank names, load-reserve-without-unit, +3
- **B2:** RETURN-ARROW-ALL-PAGES — universal return arrow

## Phase OB — Option B Deep UI Audit Fixes (ALL need visual preview before dispatch)

- **OB1:** NAV-HEADER-UNIFY — kill legacy 18-tab header on `/accounting/invoices`+`factoring`; one shared clean nav. Must land BEFORE Settlements (D1) and factoring cleanup.
- **OB2:** DEAD-TAB-AUDIT-AND-FIX — every tab/click navigates or switches content; fix dead Factoring button in Accounting header.
- **OB3:** DROPDOWN-FILTERABLE-STANDARD — all list inputs with >8 options become type-to-filter comboboxes. Shared `<FilterableCombobox>` component.
- **OB4:** NESTED-INPUT-SWEEP — find+fix any input-within-input (double-border / box-in-box). Audit script first.
- **OB5:** NAV-PATTERN-STANDARDIZE — one nav pattern app-wide: arrow+tabs, tabs below title. Fix Safety+Insurance (breadcrumb→arrow+tabs), Lists+Reports (tabs above→below). Add arrow to 425C.
- **OB6:** DEAD-STUB-TAB-RESOLUTION — Payroll (#26) stops silently redirecting to `/home` (placeholder "Settlements coming soon" at new position); Tasks stub explicitly labeled not-available.

## Phase C — Build/Data

- **C1:** PRE-SETTLEMENTS
- **C2:** FACTORING-PROFILE
- **C3:** CUSTOMER-CONTRACT-UPLOAD
- **C4:** CUST-VEND-REBUILD-RECLASSIFY

## Phase D — Financial (GATED — Jorge explicit OK per build)

- **D1:** SETTLEMENTS-PAGE ★ — replaces Payroll #26, between Cash Flow & Accounting. Depends on A1+A5+OB1+live QBO capture+preview.
- **D2:** TXN-EDITORS-7 — 7 transaction editors, needs live QBO capture.

## Phase E — Final

- **E1:** SMOKE-SERVICE-TOKEN-AUTH

## Standing rules

- migrations in `db/migrations/` only
- spine via `log_event()` only
- RLS `NULLIF`
- existing-page UI changes need preview approval
- financial writes gated on Jorge's explicit OK
- never drop verify lines in rebases
- ONE block at a time through merge before starting next

## Current status

- **SUPERSEDED** by `claude/GO-23-BUILD-SEQUENCE-STRICT-2026-09-02.md`.
- PR numbers and phases referenced here are historical; verify live state before acting.
- Do not use this queue for active dispatch; load for historical context only.
