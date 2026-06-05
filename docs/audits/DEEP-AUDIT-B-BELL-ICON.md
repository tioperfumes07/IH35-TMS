# DEEP-AUDIT-B — Bell Icon Notification Center

**Block:** CLOSURE-15-DEEP-AUDIT-B (Lane A)  
**Date:** 2026-06-05 (CST / Laredo)  
**Base SHA:** `cd467c30a` (dispatch)  
**Method:** Static source walk + optional runtime probe (`API_BASE_URL` + `VERIFY_SESSION_COOKIE`)  
**CI guard:** `npm run verify:deep-audit-b-bell-icon`

## Scope

| Check | Method | Result |
|-------|--------|--------|
| Bell renders in top bar | `Topbar.tsx` → `NotificationBell` | **PASS** |
| Unread badge | `data-testid="notification-unread-badge"`, caps at 99+ | **PASS** |
| Dropdown UI | Title, list, empty state, relative timestamps | **PASS** |
| Mark-as-read (per item) | `POST /api/v1/notifications/:id/read` | **PASS** |
| Mark-all-read | `POST /api/v1/notifications/mark-all-read` | **PASS** |
| Dismiss | `POST /api/v1/notifications/:id/dismiss` | **PASS** |
| Deep-link per type | `action_link` → React Router `<Link to={...}>` | **PASS** (static) |
| Infinite scroll | — | **N/A** — not implemented |
| SSE real-time stream | `EventSource("/api/v1/notifications/stream")` | **PASS** (static + optional runtime) |
| Page-load 500 regression (AF-9) | Delegates to existing `verify:no-flaky-endpoints-on-page-load` | **PASS** |

## UI walk (static)

1. **Open bell** — `NotificationBell` toggles `NotificationDropdown` (`data-testid="notification-dropdown"`).
2. **Unread count** — Fetched via `fetchUnreadCount()` on mount, poll (30s), and after SSE `onmessage`.
3. **List** — Up to 20 items; unread rows use `bg-blue-50/40`; read rows plain white.
4. **Actions per row** — Mark read (unread only), Dismiss, Open (when `action_link` set).
5. **Footer** — “View all” → `/notifications`.
6. **Close** — X button calls `onClose`.

## Notification types & deep-links

Declared in `notification.service.ts`:

| Type | Typical `action_link` | Deep-link status |
|------|----------------------|------------------|
| `maintenance_alert` | `/maintenance/work-orders/:id` | **PASS** (wired in `emitPredictiveAutoWoNotifications`) |
| `compliance_expiring` / `compliance_expired` | compliance module paths | **PASS** (static — compliance block emits) |
| `load_status` | dispatch/load paths | **PASS** (static) |
| `driver_alert` | driver module paths | **PASS** (static) |
| `system` | admin/settings paths | **PASS** (static) |
| `message` | messages/inbox paths | **PASS** (static) |

Runtime click-through of each type requires seeded notifications in staging — not run in this audit-only block.

## SSE stream (AUDIT-FIX-9 / #537)

- **Frontend:** `useNotifications` opens `EventSource` with `withCredentials: true`; any `onmessage` triggers `refresh()`.
- **Backend:** `stream.routes.ts` sets `text/event-stream`, CORS via `applySseCorsHeaders`, 5s poll interval, keepalive comments.
- **Resilience:** `notificationsTableReady` guard on list/unread routes; stream catches poll errors and emits keepalive only.
- **Runtime demo:** When `API_BASE_URL` + `VERIFY_SESSION_COOKIE` are set, guard opens stream for ≤4s and asserts `content-type` — validates live SSE headers post-AF-9.

## Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| B-BELL-1 | **MEDIUM** | No infinite scroll / pagination in dropdown — hard cap 20 items (`slice(0, 20)`). Older notifications only via `/notifications` full page. | `NotificationDropdown.tsx`, `useNotifications.ts` |
| B-BELL-2 | **MEDIUM** | SSE `onerror` closes `EventSource` with no reconnect/backoff; user relies on 30s polling until page reload. | `useNotifications.ts` L110-113 |
| B-BELL-3 | **LOW** | Dropdown does not show loading skeleton while `loading===true` on first fetch. | `NotificationBell.tsx` |
| B-BELL-4 | **LOW** | `Dismiss` remains on read items — acceptable UX but differs from some notification centers that auto-hide dismissed. | `NotificationDropdown.tsx` |

**CRITICAL:** None — endpoints and SSE wiring present; AF-9 guard still green.

## CI guard

`scripts/deep-audit-b-bell-icon.mjs` asserts Topbar wiring, test IDs, hook endpoints, SSE route markers, all seven notification types, and optional runtime list/count/SSE probe.
