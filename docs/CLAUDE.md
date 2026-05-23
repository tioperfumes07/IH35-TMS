# IH35-TMS — Durable Handoff Context

## 1) Instructions For Next Claude/Agent

- Run a pre-flight inspection before writing code:
  1. Confirm current branch and recent commits.
  2. Check `docs/trackers/phase-1.md` Section E for deferred items and locked decisions.
  3. Check `docs/trackers/phase-2.md` for current phase scope.
  4. Verify task is aligned to current phase (no phase drift).
- Do not introduce schema/features outside the active block.
- Keep verification-first workflow: implement, run targeted verify scripts, then full pass when block is substantial.
- If a verify script fails (except known phone-auth Twilio blocker), stop and fix before merge.

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

### Safety module structure (21 tabs, 8 groups)

1. Driver Files & Training
   - Driver Files
   - Drug & Alcohol
   - Safety Meetings
2. Hours & Fatigue
   - Hours of Service
   - HOS Violations
3. Inspections & FMCSA
   - Vehicle Inspections-IDVR
   - DOT Inspections
   - CSA Score
   - DOT Compliance
4. Incidents & Claims
   - Accidents & Incidents
   - Damage Reports
   - Trailer Interchanges
   - Cargo Claims
5. Fines & Discipline
   - Internal Fines
   - External Fines
   - Complaints (privacy-gated for Owner/Admin/Safety)
6. Driver Financial Safety
   - Escrow Record
7. Compliance Docs & Monitoring
   - Insurance
   - Permits
   - Integrity Reports
8. Settings
   - Settings

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
- `integrations.samsara_vehicles` is raw Samsara seed/projection data scoped by `operating_company_id`; UI fleet-live counters must also require `local_unit_id IS NOT NULL` for tenant-correct reporting. Seed does not auto-link existing rows; run `node scripts/link-samsara-to-units.mjs` after seed.
- `mdata.units` is populated from `integrations.samsara_vehicles` via `scripts/ingest-samsara-to-mdata-units.mjs`. Carrier attribution is defined in `config/samsara-carrier-attribution.json` (TRK=owner, TRANSP/USMCA=lease). Test units (`unit_number LIKE 'TEST-%'`) are forbidden in prod and enforced by `verify-no-test-units-in-prod.mjs`.
- QBO customer master-data tenant invariants and implemented/future-state chain are documented in `docs/qbo-sync/customers-chain.md`.
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
