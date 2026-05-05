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

## 7) What Has Been Built (Phase 1)

- Identity/RBAC foundation with workflows.
- Full master data core (drivers, customers, vendors, units, locations, equipment).
- Catalog foundation (accounting + ops + safety + quality + geography catalogs).
- Multi-tenant company scoping + RLS.
- Audit + outbox patterns.
- Safety systems:
  - driver safety file
  - dispatcher safety file
- Customer quality and risk history:
  - quality events
  - quality flags
  - credit limit source tracking
- Office UI core pages and detail pages shipped.
- Combobox type-ahead rollout completed system-wide for office UI (with approved exclusions).

## 8) Locked Architectural Decisions

- Append-only event history pattern for safety/quality timelines.
- RLS is mandatory across sensitive tables.
- Workflow + audit emission are required for key state transitions.
- Phase boundaries are hard gates: no pulling Phase 3+ features into Phase 2 blocks.
- Driver PWA UX exceptions remain valid where explicitly documented.

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
