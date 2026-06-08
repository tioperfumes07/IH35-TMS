# GAP-49 — Maintenance Pre-Flight DVIR Severity Tagging

**Phase:** GAP-HIGH · **Wave:** G-W · **Lane:** B · **Classification:** ADDITIVE

**Sources:** G18 master rule · WF-050 hard-block · 49 CFR §396.11 (Driver Vehicle
Inspection Report) read with Appendix G to Subchapter B.

## Problem

Drivers submit DVIRs from the PWA but defects were not tagged with a regulatory
severity. WF-050 hard-blocked dispatch on **any** defect — even cosmetic ones
like "wiper streaks" — producing false dispatch lockouts that operators bypassed
via the "resolve" workflow without an actual repair (a safety risk). Per 49 CFR
§396.11:

- **MAJOR** defect → vehicle UNSAFE to operate → dispatch **BLOCKED**.
- **MINOR** defect → note for next service → dispatch **ALLOWED**.
- **OBSERVATION** → informational only → no work order.

## Approach (additive)

`safety.dvir_defects` (migration 0344) is **append-only**: an UPDATE/DELETE
trigger blocks mutation, `UPDATE` is `REVOKE`d from `ih35_app`, and its `severity`
column is constrained to `('minor','major')`. Severity classification and
Manager-level overrides therefore **cannot** be modeled as in-place updates.

Migration `202606071700_dvir_defect_severity_tagging.sql` introduces an **append-only
audit table** `safety.dvir_defect_severity_tags` that records every severity tag
event (classifier output, driver selection, manager override) for a defect. The
**effective severity** for a defect is the most recent row (`created_at DESC`).
This preserves the full override history and keeps the canonical defect row
immutable. A `major_defect_code` helper column and a `severity` index are added
to `safety.dvir_defects` as additive DDL.

## Pieces

| Piece | File |
| --- | --- |
| Migration | `db/migrations/202606071700_dvir_defect_severity_tagging.sql` |
| Major defect catalog (CFR codes, locked) | `apps/backend/src/maintenance/pre-flight/major-defect-catalog.ts` |
| Severity service (classify, override, RBAC, audit) | `apps/backend/src/maintenance/pre-flight/dvir-severity.service.ts` |
| Routing service (auto-WO / next-PM / log-only) | `apps/backend/src/maintenance/pre-flight/dvir-routing.service.ts` |
| Routes | `apps/backend/src/maintenance/pre-flight/routes.ts` |
| Tests | `apps/backend/src/maintenance/pre-flight/__tests__/` |
| Dispatcher queue page | `apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx` |
| Severity badge | `apps/frontend/src/components/maintenance/DvirSeverityBadge.tsx` |
| WO detail severity (EDIT) | `apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx` |
| Driver PWA picker (EDIT) | `apps/driver-pwa/src/pages/DVIR.tsx` |
| CI guard | `scripts/verify-dvir-severity-tagging.mjs` |

## API

- `GET /api/v1/maintenance/pre-flight/dvir-queue?severity=&status=` — queue rows
  with effective severity, ordered major → minor → observation.
- `PATCH /api/v1/maintenance/pre-flight/defects/:id/severity` — audit-tracked
  override. **Manager+ role** is required whenever the change crosses the major
  boundary (current→major or major→non-major).
- `POST /api/v1/maintenance/pre-flight/defects/:id/route` — route the defect by
  effective severity (idempotent).
- `GET /api/v1/maintenance/pre-flight/major-defect-catalog` — the locked CFR
  catalog.

## Classifier

`classifyDefect(description, category)` matches free text + category/item key
against `MAJOR_DEFECT_CODES`. It is **conservative**: any catalog keyword hit
promotes the defect to MAJOR, and non-matching defects default to MINOR (never
silently downgraded to OBSERVATION). The test set in
`__tests__/dvir-severity.test.ts` asserts that every known-major defect class
from §396.11 classifies as major (the PAUSE condition for driver safety / DOT
compliance liability).

## Routing

- **major** → auto-creates a `maintenance.work_orders` row (origin `dvir`); the
  WF-050 unit dispatch block set at submit time keeps the unit out of service.
- **minor** → flagged for the unit's next-PM service queue, no immediate WO.
- **observation** → logged only.

## Acceptance

- [x] Migration 202606071700 applied (append-only severity tags + RLS + grants).
- [x] Catalog seeded with major defect codes from 49 CFR §396.11.
- [x] Driver PWA shows the severity picker (Major / Minor / Observation, default Minor) with major confirmation.
- [x] Major defects auto-create maintenance work orders.
- [x] WF-050 dispatch block continues to fire on majors (no regression).
- [x] Manager+ role enforced on major↔minor severity changes.
- [x] `verify:dvir-severity-tagging` wired into the CI chain.
