# GAP-66 Dispatcher Home Role View

## Goal

Provide a dispatcher-focused `/home` view so dispatch users see queue-critical information (active loads, pending detention approvals, and booking gap analytics) without owner-specific cards.

## Backend

- Added `GET /api/v1/dispatcher-board/home` in `apps/backend/src/dispatcher-board/role-views/routes.ts`.
- Added `getDispatcherHomeData()` service in `apps/backend/src/dispatcher-board/role-views/dispatcher.service.ts`.
- Data is scoped by current authenticated dispatcher (`l.dispatcher_user_id = $1::uuid`) under `withCurrentUser(...)` RLS context.
- Payload sections:
  - `kpis`: active/late loads, today's pickups/deliveries
  - `active_loads`: compact list with late + detention signal (tri-signal badges)
  - `pending_actions`: detention approvals, incoming unread queue, open booking gaps
  - `booking_gap_analytics`: 7-day booked/gap/exception stats

## Frontend

- Filled role-specific page `apps/frontend/src/pages/home/roles/DispatcherHome.tsx` (stub → real content).
- Added dispatcher widgets:
  - `DispatcherKpiBar`
  - `DispatcherActiveLoadsPanel`
  - `DispatcherPendingActionsPanel`
- `HomePage.tsx` role router (from PR #642) routes `Dispatcher` → `DispatcherHome`; Owner/Maintenance/default paths unchanged.

## Verification

- Added guard script: `scripts/verify-dispatcher-home.mjs`.
- Script is wired to `npm run verify:dispatcher-home`.
- CI runs this guard in `.github/workflows/ci.yml`.

## RBAC

- `GET /api/v1/dispatcher-board/home`: Owner, Administrator, Manager, Dispatcher (403 for other roles).
- Frontend: Dispatcher role sees DispatcherHome; Owner still sees OwnerHome via HomePage switch.
