# IH35-TMS — Durable Handoff Context

> **★ DEFINITION OF DONE (BINDING):** `docs/specs/DEFINITION-OF-DONE.md` — DOD-A…E + §10. CI-green is the floor, not the verdict.
>
> **★ EVERY PR AUDIT CHECKLIST (BINDING, every session):** `docs/specs/EVERY-PR-AUDIT-CHECKLIST.md` — FINDING · LANE · DOD-A…E · **VERIFY-1…8** · **MODULE_PROGRESS** · MIGRATE · Rule 16. Missing keys → commit-msg reject + verify-step **1430** (`verify-no-money-theater`). Rule 23 theater ban. Rule 24 — module DONE = **N of M** in `docs/module-completion/` (CI **1431**).

> **SESSION LAW (auto-loaded every Cursor session):** `docs/specs/CURSOR-OPERATING-CONSTITUTION.md` + Rule #0 `docs/specs/QUALITY-STANDARD-LOCKED.md` + Law of the Land `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md` + always-apply `.cursor/rules/00`–`07` + `10`–`15`. Trust over speed. Verify live. No guess / patch / defer. Never delete modules — only add. Multi-agent review required on non-trivial/financial work.


## 1) Instructions For Next Claude/Agent

- Run a pre-flight inspection before writing code:
  1. Confirm current branch and recent commits.
  2. Check `docs/trackers/phase-1.md` Section E for deferred items and locked decisions.
  3. Check `docs/trackers/phase-2.md` for current phase scope.
  4. Verify task is aligned to current phase (no phase drift).
- Do not introduce schema/features outside the active block.
- Keep verification-first workflow: implement, run targeted verify scripts, then full pass when block is substantial.
- If a verify script fails (except known phone-auth Twilio blocker), stop and fix before merge.
- **Before EVERY push, run `npm run verify:static`** and fix any `FAIL(gated)` locally — never push into a
  red static guard. It runs all `scripts/verify-*.mjs` with no reachable DB (dead-port sentinel; never
  touches prod) and fails only on a guard CI actually runs. See `docs/specs/BRANCH-TOOLING.md` §2.
- **To reproduce CI's `build-typecheck` EXACTLY before pushing, run `npm run verify:local-ci`.** It spins up
  an EPHEMERAL throwaway local Postgres (a fresh cluster on `localhost:54329/ih35_verify`, destroyed on exit —
  never touches an existing DB or prod) and runs the **exact CI command, `npm run verify:pre-commit`** — every
  one of the ~156 `scripts/verify-steps/*.mjs` (db-reset → migrate → build → tsc → the full ~250-guard suite →
  backend db.tests). Because it runs literally what CI runs, it **cannot miss a guard** — the earlier
  hand-picked-subset version silently skipped guards (schema-parity, mdata-entity-scope) that live in a
  verify-step but not `verify:arch-design`, and PRs kept going red. Requires a local Postgres SERVER binary
  (Postgres.app or `brew install postgresql@16`); takes ~6-10 min. Run it before every substantive push.

## 1a) LINKAGE LAW + CANONICAL WIRING (read before any block)

The LINKAGE law + canonical table map now lives in the **auto-loaded** skill
`.claude/skills/ih35-tms-standards/SKILL.md` **§10** (so it can never be "not in context" again).
Before writing any block, read SKILL §10 + `docs/trackers/FINAL-TABLES-WIRING-FOR-CODER-2026-07-05.md`
(canonical/RETIRE §A, hub tables §E). **Never write/FK a RETIRE table** — canonical: `driver_finance.*`
(not `payroll.*`/`settlement.*`), `mdata.qbo_*` (not `accounting.qbo_*`), `banking.*` (not `bank.*`),
`maintenance.*` (not `maint.*`), `mdata.vendors`, `mdata.loads`, `catalogs.cancellation_reasons`.
Enforced by CI guards **G1–G4** (registry-complete, acceptance, guard-wired, canonical-table-writes).
Precedence: prod-verified FACTS resolve prod > guard > repo > doc > memory; owner DECISIONS are AUTHORITY.

## 2) Jorge & Business Context

- Company: IH35 Dispatch / IH35 Trucking operations.
- Multi-entity structure:
  - `TRANSP` (operating carrier, active)
  - `TRK` (asset holder, active)
  - `USMCA` (future operating carrier, hidden until July 2026 launch)
- Operational tempo: high dispatch throughput, tight same-day decision cycle.
- Launch target referenced across work: May 20 production cutover window.

## 3) Current Factoring / Financing Structure

- Current factor: Faro Factoring.
- Equipment financing creditor: Commercial Credit Group (CCG).
- Planned factor migration path: Faro -> RTS (Phase 5 operationalization).
- Customer credit-limit source model is already in place:
  - `factor`
  - `manual`
  - `rmis_future` (placeholder)

## 4) Technical Stack & Infrastructure

- Backend: Node.js + Fastify + TypeScript.
- Frontend Office UI: Vite + React + TypeScript.
- Driver PWA: separate Vite + React app (dark-theme foundation delivered).
- Database: Postgres (Neon).
- Cache/queue infra: Redis/Outbox pattern.
- Storage: Cloudflare R2 (`ih35-tms-evidence`) for documents.
- Auth: Lucia + Google OAuth + phone auth endpoints (Twilio env pending in production-ready mode).

## 5) Repo Structure

- `apps/backend/` Fastify API.
- `apps/frontend/` Office UI.
- `apps/driver-pwa/` Driver app.
- `db/migrations/` SQL migrations.
- `scripts/` verification and operational scripts.
- `docs/trackers/` phase trackers and Section E.
- `docs/specs/` blueprint/spec source of truth.

## 6) Block Convention

- Work is executed in numbered blocks.
- Each block must define:
  - scope
  - in-scope / out-of-scope
  - verification requirements
  - merge protocol (pause or direct merge)
- Cross-check merge rules from request text are authoritative per block.

## 7) Current Project Knowledge (Safety v6.4 lock)

Locked 2026-05-07 (P3-T11.17.2 schema + P3-T11.17.3 UI + hotfix-1).  
Top hover-dropdown navigation only for Safety. Never side panel (Jorge G3).

### Safety module structure — 28 tabs / 9 groups (canonical)

**SOURCE OF TRUTH = `apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts`**
(`SAFETY_GROUPS`, with `SAFETY_CANONICAL_TAB_COUNT` / `SAFETY_CANONICAL_GROUP_COUNT`), enforced by
`scripts/verify-safety-count-nav-integrity.mjs` + `verify-safety-tab-coverage.mjs`. Never trust a
count written in prose — including this one; read the array.

SAF-F28 (2026-07-24): this section previously claimed **21 tabs / 8 groups** while the config, both
CI guards and `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` all said 28/9. The doc had been left behind
by four groups' worth of build. It is corrected below, and the pointer above is the durable fix —
a hardcoded inventory in prose will drift again the next time a tab lands.

1. Driver Files & Training — Driver Files · Drug & Alcohol · Safety Meetings
2. Hours & Fatigue — Hours of Service · HOS Violations
3. Inspections & FMCSA — Vehicle Inspections-IDVR · DOT Inspections · Driver Scoring · CSA Score ·
   DOT Compliance
4. Incidents & Claims — Safety Events · Accidents & Incidents · Damage Reports ·
   Trailer Interchanges · Cargo Claims
5. Fines & Discipline — Internal Fines · External Fines · Complaints (privacy-gated to
   Owner/Admin/Safety)
6. Driver Financial Safety — Escrow Record
7. Compliance Docs & Monitoring — Geofence Alerts · Insurance · Permits · Integrity Reports ·
   Position History
8. Workforce Planning — Driver Scheduler · Leave Requests · Leave Balances
9. Settings — Settings

**Alias tabs** (`SAFETY_ALIAS_TABS`) are secondary entry points rendered inside a group's dropdown
and deliberately NOT part of the canonical 28 — adding them to `SAFETY_GROUPS` breaks the count
guards. Currently: Cert Expiry, Training Programs, Training Records, ELD Audit Trail,
Photo Comparison, 425C Audit Trail, Safety Reports (the last six were mounted routes with zero
inbound links until SAF-F22).

### Safety UI lock notes

- Active driver filter default: `Active 7-10 days`.
- Header pattern: back-arrow + breadcrumb + `Safety` title + descriptor.
- Legacy route redirect retained: `/safety/vehicle-inspections` -> `/safety/idvr`.
- v6.3 HTML preview references (including `docs/specs/02_PRODUCTION_CLEAN_v6_3.html`) are superseded by v6.4 and kept for historical reference only.

## 8) Locked Architectural Decisions

- Append-only event history pattern for safety/quality timelines.
- RLS is mandatory across sensitive tables.
- Workflow + audit emission are required for key state transitions.
- Phase boundaries are hard gates: no pulling Phase 3+ features into Phase 2 blocks.
- Driver PWA UX exceptions remain valid where explicitly documented.
- R2 CORS policy is required for `app.ih35dispatch.com`, `driver.ih35dispatch.com`, `api.ih35dispatch.com`, and localhost dev origins.
- `DATABASE_URL` is Neon; Render `ih35-db` is not in active use.
- Outbox processor runs in-process inside backend (no separate Render worker).
- Backend refuses to boot if any `db/migrations/*.sql` file is missing from both `_system._schema_migrations` and `ih35_migrations.applied_migrations`; Render Pre-Deploy must be `npm run db:migrate` for backend services.
- Audit events live in `audit.audit_events` (`uuid`, `created_at`, `event_class`, `severity`, `payload`, `actor_user_uuid`, `source`). `audit.events` is not a table and must not be referenced by code.
- HELP is a frontend-only module (no backend routes). Tenant scoping is N/A. If a backend Help service is added later, add `verify-help-tenant-scope.mjs` at that time.
- Office HOME exposes QBO sync health via `GET /api/v1/qbo/sync-health`. The endpoint is tenant-scoped and surfaces `qbo.sync_runs` latest, `qbo.sync_alerts` open count, and `outbox.events` failed count for the current tenant.
- QBO sync conflict detection is read-only in this phase: `GET /api/v1/qbo/sync-conflicts?entity={customer|vendor|product|account}&limit<=50&cursor=...` and the QBO Sync Dashboard Conflicts tab consume tenant-scoped conflict rows with types `field_drift`, `missing_in_qbo`, `missing_in_mirror`. Resolution actions remain out of scope for this PR.
- `GET /api/v1/qbo/sync-event-log` surfaces per-tenant QBO sync observability from `qbo.sync_runs` + `qbo.sync_alerts` + terminal `outbox.events` where `event_type LIKE 'qbo.%'`; read-only, tenant-scoped, cursor-paginated (no OFFSET), and linked from the Office HOME sync health card.
- QBO run lifecycle state machine (pending/in_progress/succeeded/failed_retryable/failed_terminal), retry backoff policy, and dead-letter behavior are defined in `docs/qbo-sync/state-machine.md`.
- T11.20.6.2 cut 1 enables customers-only TMS write-back: `mdata.customers` writes enqueue `tms.customer.push_requested`, handler resolves/updates tenant-scoped `mdata.qbo_customers`, and customer delivery is delegated to existing `push.service.ts` QBO master push flow.
- T11.20.6.2 cut 2 enables vendors-only TMS write-back: `mdata.vendors` writes enqueue `tms.vendor.push_requested`, handler resolves/updates tenant-scoped `mdata.qbo_vendors`, and vendor delivery is delegated to existing `push.service.ts` QBO master push flow.
- T11.20.6.2 cut 4 enables accounts-only TMS write-back: `catalogs.accounts` writes enqueue `tms.account.push_requested`, handler resolves/updates tenant-scoped `mdata.qbo_accounts`, and account delivery is delegated to existing `push.service.ts` QBO master push flow.
- T11.20.6.2 cut 5 enables invoices-only TMS write-back: `accounting.invoices` and `accounting.invoice_lines` writes enqueue `tms.invoice.push_requested`, handler assembles tenant-scoped QBO Invoice payload lines, and pushes through `push.service.ts` while upserting `mdata.qbo_invoices`.
- T11.20.6.2 cut 6 enables bills-only TMS write-back: bill writes enqueue `tms.bill.push_requested`, handler resolves tenant vendor + line account QBO IDs (fail-fast if missing), delivers QBO bill payload, mirrors success in `mdata.qbo_bills`, and syncs `accounting.bills` QBO identifiers.
- **SUPERSEDED (2026-07-02) — the T11.20.6.2 write-back cuts above (customer/vendor/account/invoice/bill, all six `tms.*.push_requested` handlers) are gated OFF under the parallel-books architecture: TMS does NOT write back to QBO. Enforced by IMPORT-P0b (`QBO_ENTITY_PUSH_ENABLED` default OFF, per-entity-only, + clone-origin refusal). Historical cut records kept for reference (append-only). Canonical relationship: `docs/specs/TMS-QBO-PARALLEL-BOOKS.md`; detailed mechanics: `docs/specs/ACCOUNTING-ARCHITECTURE.md`; locked decision: `docs/lockdown/00_LOCKED_DECISIONS.md` §8.**
- `GET /api/v1/samsara/vendor-mapping-integrity` is a read-only tenant-scoped integrity contract for driver↔QBO vendor mapping (`integrations.samsara_drivers` + `mdata.drivers.qbo_vendor_id` + `mdata.qbo_vendors`), surfacing `unmapped_drivers`, `duplicate_mapping`, and `name_mismatch` without auto-fixes.
- `integrations.samsara_vehicles` is raw Samsara seed/projection data scoped by `operating_company_id`; UI fleet-live counters must also require `local_unit_id IS NOT NULL` for tenant-correct reporting. Seed does not auto-link existing rows; run `node scripts/link-samsara-to-units.mjs` after seed.
- CAP-13 geofencing is local-first: tenant-scoped polygons live in `geo.geofences`, detection emits append-only `geo.geofence_events`, and reporting/UI must read geofence transitions from local DB (not external APIs).
- `mdata.units` is populated from `integrations.samsara_vehicles` via `scripts/ingest-samsara-to-mdata-units.mjs`. Carrier attribution is defined in `config/samsara-carrier-attribution.json` (TRK=owner, TRANSP/USMCA=lease). Test units (`unit_number LIKE 'TEST-%'`) are forbidden in prod and enforced by `verify-no-test-units-in-prod.mjs`.
- CAP-11 HOS clocks are local-first and computed strictly from tenant-scoped `hos.duty_status_events` (append-only; no UPDATE/DELETE). Dispatch HOS visibility and driver HOS detail must read these clocks, not derived placeholders.
- QBO customer master-data tenant invariants and implemented/future-state chain are documented in `docs/qbo-sync/customers-chain.md`.
- Block-20.1 foundation adds `?basis=cash|accrual` contract for accounting report endpoints with default `accrual`; cash transforms are currently wired for Balance Sheet + Trial Balance only, while Cash Flow + AR/AP aging + IFTA remain accrual outputs.
- Closed-period cash-basis numbers are snapshotted in `accounting.period_cash_basis_snapshot` and verified via `verify-cash-basis-engine-determinism.mjs` plus `verify-period-cash-basis-snapshot-shape.mjs`.
- Block-20.2 frontend basis selector is restricted to Balance Sheet, Trial Balance, Profit & Loss, and Reports Home only; Cash Flow, AR/AP Aging, and IFTA remain accrual-only and are guarded by `verify-basis-selector-allowed-pages.mjs`.
- Block-20.3 locks closed-period cash-basis outputs: snapshot is computed at period close and read-only thereafter; closed-period cash reads return snapshot payload (no recompute), enforced by DB trigger + `verify-period-cash-basis-snapshot-readonly.mjs`.
- Documents are soft-delete only with a 90-day Owner recovery window.
- `docs.file_links` is polymorphic; `entity_id` is not enforced as a single FK.
- Documents preview uses native browser PDF viewer (not PDF.js).
- Driver self-resolution uses dedicated `/me` endpoint (never list-and-take-first).
- FMCSA lookups are cached 7 days, with no automatic re-verification (Phase 6).
- Manager can update document metadata but cannot soft-delete files.

## 9) Deferred Items By Phase

- Canonical deferred backlog is maintained in `docs/trackers/phase-1.md` Section E.
- Phase mapping:
  - Phase 2: FMCSA check + rehire-chain hardening carryovers.
  - Phase 3: dispatch core, load-linked event FKs, cancellation intelligence, OCR ingest.
  - Phase 4: driver PWA expansion (offline queue, push, messaging, i18n).
  - Phase 5: banking/factoring/settlement/payroll hardening.
  - Phase 6: reporting, scoring, suggestion engines, unified timeline.
  - Phase 7: cutover infra hardening and launch dependencies.
  - Phase 8+: productization strategy.

## 10) UI/UX Decisions Locked

- Dense industrial office UI style is intentional.
- Design tokens are centralized and should not be casually changed.
- Combobox is the office standard for dropdowns.
- Explicit exceptions stay native where documented (e.g., two-option country selector).

## 11) Key Operational Facts

- Dispatch decisions must be made fast with visible risk signals.
- Customer behavior history directly impacts profitability and dispute leverage.
- Safety and accountability records are institutional memory and remain permanent.

## 12) Convention Rules (Critical)

- Do not rewrite historical tracker entries.
- Append, do not erase, Section E history.
- Never claim a phase is closed unless verification criteria are met.
- Keep commit messages in established block format.
- Treat external env blockers explicitly (do not misclassify as code regressions).

## 13) Files Next Claude Must Read (In Order)

1. `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md`
2. `docs/trackers/phase-1.md`
3. `docs/trackers/phase-2.md`
4. `docs/STATUS.md`
5. `package.json` (scripts and verification matrix)

## 14) Most Recent Work Context

- Phase 1 closure gate block (`BT-1-GATE-01`) prepared:
  - full verification matrix run
  - gate verification script added (`db:verify:phase1-gate`)
  - tracker finalization performed
  - phase-2 entry document created
- Known external blocker remains: `db:verify:phone-auth` requires Twilio env (`TWILIO_ACCOUNT_SID`).

## 15) Known Production Blockers Before May 20

- Driver onboarding flow is still required (HIGH priority, P3-T0).
- Verify-script fixture cleanup in `identity.users` is pending.
- Backup and disaster-recovery strategy is pending (P7-T1).
- Production Twilio WhatsApp Business sender approval is pending (P7-T3, Meta verification 7-14 days).
- QBO production credentials approval is pending (P7-T4).

## Database Grants

The runtime database user `ih35_app` requires `USAGE` on each schema
plus `SELECT/INSERT/UPDATE/DELETE` on each table. This is enforced
via migration 0065.

When adding a NEW schema in a future migration:
1. Add the schema name to the `schemas[]` array in 0065 OR add a
   small follow-up migration that grants on the new schema
2. The DEFAULT PRIVILEGES from 0065 will auto-grant on new tables
   IF the schema is in the array; otherwise tables need explicit
   GRANT in the migration that creates them

Example for a new schema:
```sql
GRANT USAGE ON SCHEMA my_new_schema TO ih35_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
  my_new_schema TO ih35_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA my_new_schema
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ih35_app;
```

This is enforced because legacy tables predating migration 0065 had
no grants, leading to runtime 500 errors. Migration 0065 fixes this
historically and DEFAULT PRIVILEGES prevents recurrence.

## 16) Block-21 foundation

- Block-21 adds `accounting.expense_category_account_map` (tenant-scoped, soft-delete-only) to resolve deterministic category -> GL account mappings for future posting blocks (22-28).
- Canonical chart-of-accounts table in this repo is `catalogs.accounts`; Block-21 mapping rows FK into that table.
- Consumer API surface for future posting blocks: `resolveAccountForCategory(operating_company_id, category_kind, category_code)` in `apps/backend/src/accounting/expense-category-map/resolver.service.ts`.
