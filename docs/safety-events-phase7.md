# P7 Safety Events — Block 02

Block 02 adds tenant-scoped, append-only Safety Events across backend, DB, frontend, and CI guards.

## Scope delivered

- Backend route module: `apps/backend/src/safety/events/safety-events.routes.ts`
  - `GET /api/v1/safety/events-log`
  - `GET /api/v1/safety/events-log/kpis`
  - `GET /api/v1/safety/events-log/:id`
  - `GET /api/v1/safety/events-log/:id/notes`
  - `POST /api/v1/safety/events-log`
- Migration: `db/migrations/0261_safety_events.sql`
  - `safety.safety_events` + `safety.safety_event_notes`
  - append-only triggers for UPDATE/DELETE blocking
  - RLS tenant policies + grants
  - conditional `audit.tg_audit_row` trigger wiring
- Frontend page: `apps/frontend/src/pages/safety/SafetyEventsPage.tsx`
  - KPI row
  - filtered event list
  - event detail drawer
  - log-event modal
- CI guards
  - `verify:safety-events-append-only`
  - `verify:safety-events-tenant-scope`

## Notes

- This block intentionally does not include mutation routes beyond append-only inserts.
- Block 03 scope is intentionally untouched.
